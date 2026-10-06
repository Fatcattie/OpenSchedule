#!/usr/bin/env node
/**
 * check-mermaid.mjs —— 仓库内 .mermaid 图表的语法守卫
 *
 * 背景：本项目多次出现「图表静默损坏」——文件能存盘、能被编辑器打开，
 *       但 mermaid 解析器读不了（渲染出来是空白或报错）。已知两类致命陷阱：
 *         · sequenceDiagram 的消息/Note 文本里出现 ASCII 分号 `;`  → 语句被截断
 *         · classDiagram  的成员行里出现 ASCII 花括号 `{}`        → 成员定义解析失败
 *       这类问题不会让 CI 变红（图表不在测试套件内），只能靠显式检查发现。
 *
 * 用法：
 *   node scripts/check-mermaid.mjs                # 扫描整个仓库（自动跳过 node_modules 等）
 *   node scripts/check-mermaid.mjs docs           # 只扫指定目录
 *   node scripts/check-mermaid.mjs a.mermaid b.mermaid
 *
 * 依赖策略（重要）：
 *   本脚本**不往仓库写入任何依赖**。它优先使用当前可解析到的 `mermaid` / `jsdom`；
 *   若解析不到，会自动在**操作系统临时目录**引导一个隔离环境（一次性、可复用缓存），
 *   把自身复制进去再执行。因此仓库的 package.json / lockfile **永远不被改动**。
 *
 * 退出码：0 = 全部通过；1 = 存在解析失败或未找到任何图表。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SELF = fileURLToPath(import.meta.url)
const ISOLATED_FLAG = '--isolated'
const CWD_PREFIX = '--cwd='
const CACHE_DIR = path.join(os.tmpdir(), 'openschedule-mermaid-guard')

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.expo', 'dist', 'build', 'coverage',
  '.next', '.turbo', '.cache', '__pycache__', '.venv', 'venv',
  '.pytest_cache', 'android', 'ios', '.workbuddy-ai',
])

// ────────────────────────────── CLI ──────────────────────────────

function parseArgs(argv) {
  let isolated = false
  let displayRoot = null
  const targets = []
  for (const a of argv) {
    if (a === ISOLATED_FLAG) isolated = true
    else if (a.startsWith(CWD_PREFIX)) displayRoot = a.slice(CWD_PREFIX.length)
    else targets.push(a)
  }
  return { isolated, displayRoot, targets }
}

// ─────────────────────── 依赖引导（自举）───────────────────────

async function depsAvailable() {
  try {
    await import('mermaid')
    await import('jsdom')
    return true
  } catch {
    return false
  }
}

function ensureIsolatedEnv() {
  const marker = path.join(CACHE_DIR, 'node_modules', 'mermaid')
  if (fs.existsSync(marker)) return true

  process.stderr.write(`[guard] 未找到 mermaid/jsdom，正在仓库外引导隔离环境：${CACHE_DIR}\n`)
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  if (!fs.existsSync(path.join(CACHE_DIR, 'package.json'))) {
    fs.writeFileSync(
      path.join(CACHE_DIR, 'package.json'),
      JSON.stringify({ name: 'openschedule-mermaid-guard', private: true, version: '0.0.0' }, null, 2),
    )
  }

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const r = spawnSync(npm, ['install', 'mermaid@11', 'jsdom', '--no-audit', '--no-fund'], {
    cwd: CACHE_DIR, stdio: 'inherit', shell: true,
  })
  if (r.status !== 0) {
    process.stderr.write('[guard] 引导失败。请联网后重试，或手动安装依赖后再运行本脚本。\n')
    return false
  }
  return true
}

/**
 * 复制自身到隔离目录再执行 —— ESM 的裸包解析基于「导入方文件的位置」而非 cwd，
 * 因此必须让脚本本体也位于隔离目录内，`import('mermaid')` 才能命中隔离环境的 node_modules。
 */
function reexecIsolated(targets, displayRoot) {
  const copy = path.join(CACHE_DIR, 'check-mermaid.mjs')
  fs.copyFileSync(SELF, copy)
  // 隔离进程的 cwd 是缓存目录，因此无显式目标时必须把「原始工作目录」传进去，
  // 否则 collect() 会去扫缓存目录（那里没有 .mermaid）。
  const effective = targets.length ? targets : [displayRoot]
  const abs = effective.map((t) => path.resolve(t))
  const r = spawnSync(
    process.execPath,
    [copy, ISOLATED_FLAG, `${CWD_PREFIX}${displayRoot}`, ...abs],
    { cwd: CACHE_DIR, stdio: 'inherit' },
  )
  process.exit(r.status === null ? 1 : r.status)
}

// ────────────────────────── 文件收集 ──────────────────────────

function collect(targets) {
  const roots = targets.length ? targets : ['.']
  const out = []

  const walk = (p) => {
    let st
    try { st = fs.statSync(p) } catch { return }
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue
        walk(path.join(p, e.name))
      }
    } else if (p.endsWith('.mermaid')) {
      out.push(p)
    }
  }

  for (const r of roots) walk(r)
  return [...new Set(out)].sort()
}

// ───────────────────── 图块切分与静态提示 ─────────────────────

const DIAGRAM_START = /^\s*(classDiagram|sequenceDiagram|sequenceDiagram-v2|graph|flowchart|erDiagram|stateDiagram|stateDiagram-v2|journey|gantt|pie|mindmap|timeline|quadrantChart|gitGraph|C4Context|block-beta|architecture-beta)\b/

function splitBlocks(text) {
  const lines = text.split(/\r?\n/)
  const starts = []
  lines.forEach((l, i) => { if (DIAGRAM_START.test(l)) starts.push(i) })
  return starts.map((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : lines.length
    return { line: s + 1, kind: lines[s].trim().split(/\s+/)[0], text: lines.slice(s, end).join('\n') }
  })
}

/** 已知致命陷阱的静态定位 —— 只在解析失败时作为「更好懂的提示」输出 */
function staticHints(block) {
  const hints = []
  const lines = block.text.split(/\r?\n/)

  lines.forEach((raw, i) => {
    const lineNo = block.line + i
    const body = raw.replace(/^\s+/, '')
    if (body.startsWith('%%')) return // 注释行安全

    if (block.kind.startsWith('sequenceDiagram')) {
      if (/;/.test(raw)) {
        hints.push(`L${lineNo}: 序列图消息里出现 ASCII 分号 ";" —— 请改用全角 "；"（mermaid 会在此截断语句）`)
      }
    }

    if (block.kind === 'classDiagram') {
      const isClassOpener = /^\s*class\s+[\w~-]+\s*\{\s*$/.test(raw)
      const isBraceOnly = /^\s*[{}]\s*$/.test(raw)
      if (!isClassOpener && !isBraceOnly && /[{}]/.test(raw)) {
        hints.push(`L${lineNo}: 类图成员行里出现 ASCII 花括号 "{}" —— 请改用全角 "｛｝"（mermaid 不接受成员里的 {}）`)
      }
    }
  })

  return [...new Set(hints)]
}

// ─────────────────────────── 主流程 ───────────────────────────

const { isolated, displayRoot, targets } = parseArgs(process.argv.slice(2))
const root = displayRoot ? path.resolve(displayRoot) : process.cwd()

if (!isolated) {
  if (!(await depsAvailable())) {
    if (!ensureIsolatedEnv()) process.exit(1)
    reexecIsolated(targets, root)
  }
}

const { JSDOM } = await import('jsdom')
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="c"></div></body></html>', {
  pretendToBeVisual: true,
})
globalThis.window = dom.window
globalThis.document = dom.window.document
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator, configurable: true, writable: true,
  })
} catch { /* Node 22 的 navigator 是 getter，忽略 */ }
globalThis.MutationObserver = dom.window.MutationObserver
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0)

const mermaid = (await import('mermaid')).default
mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', logLevel: 'fatal' })

const files = collect(targets)
if (files.length === 0) {
  process.stderr.write('[guard] 未找到任何 .mermaid 文件\n')
  process.exit(1)
}

let blocks = 0
let passed = 0
const failures = []

for (const file of files) {
  const abs = path.resolve(file)
  const rel = path.relative(root, abs) || abs
  const list = splitBlocks(fs.readFileSync(abs, 'utf8'))
  const marks = []

  for (const b of list) {
    blocks++
    try {
      await mermaid.parse(b.text)
      passed++
      marks.push(`ok L${b.line}`)
    } catch (err) {
      marks.push(`FAIL L${b.line}`)
      failures.push({
        rel, line: b.line, kind: b.kind,
        msg: String((err && err.message) || err).split('\n')[0].trim(),
        hints: staticHints(b),
      })
    }
  }

  const bad = marks.some((m) => m.startsWith('FAIL'))
  process.stdout.write(`${bad ? 'FAIL' : ' ok '}  ${rel}  (${list.length} 块)\n`)
}

process.stdout.write(`\n──────── 汇总 ────────\n文件: ${files.length}   图块: ${blocks}   通过: ${passed}   失败: ${failures.length}\n`)

if (failures.length) {
  process.stdout.write('\n失败明细：\n')
  for (const f of failures) {
    process.stdout.write(`  · ${f.rel}:${f.line}  [${f.kind}]\n      ${f.msg}\n`)
    for (const h of f.hints) process.stdout.write(`      ↳ 提示 ${h}\n`)
  }
  process.exit(1)
}
