#!/usr/bin/env node
/**
 * audit-deployable.mjs —— 生产依赖漏洞门禁（按可交付范围收敛门槛）
 *
 * 用法：node scripts/audit-deployable.mjs [--audit-level high]
 *
 * 背景：`pnpm audit` 在 workspace 子目录执行时仍会审整个 lockfile（不受 cwd 限制），
 * 无法用 `cd services/api && pnpm audit` 收敛范围。本脚本显式按「可交付包」过滤：
 *   - 纳入：services/api（主后端）· apps/web（前端）· packages/*（共享领域规则包）
 *   - 排除：apps/mobile（Expo/RN 工具链，未进入本仓库 build/deploy 流水线），
 *           其剩余 high 为该工具链传递依赖且部分无修复版本，作为已知接受风险单列。
 *
 * 退出码：纳入范围内存在 >= 门槛（默认 high）的漏洞 → 1，否则 0。
 */
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 }

const argv = process.argv.slice(2)
const levelArg = argv[argv.indexOf('--audit-level') + 1]
const THRESHOLD = SEVERITY_RANK[levelArg] !== undefined ? levelArg : 'high'

/** 可交付（纳入门禁）的 workspace 包路径前缀 */
const IN_SCOPE_PREFIXES = ['services/api', 'apps/web', 'packages/']

function inScope(path) {
  const normalized = String(path).replace(/\\/g, '/')
  return IN_SCOPE_PREFIXES.some((p) => normalized.startsWith(p))
}

function runAuditJson() {
  try {
    return execFileSync('pnpm', ['audit', '--prod', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === 'win32',
    })
  } catch (err) {
    // 存在漏洞时 pnpm audit 以非 0 退出，但 stdout 仍是完整 JSON
    if (err.stdout) return String(err.stdout)
    throw err
  }
}

const raw = runAuditJson()
const report = JSON.parse(raw)
const advisories = Object.values(report.advisories ?? {})

/** 展平成「一条漏洞 × 一条依赖路径」 */
const findings = []
for (const adv of advisories) {
  for (const finding of adv.findings ?? []) {
    for (const p of finding.paths ?? []) {
      findings.push({
        module: adv.module_name,
        severity: adv.severity,
        title: adv.title,
        advisory: adv.github_advisory_id ?? String(adv.id),
        url: adv.url,
        patched: adv.patched_versions,
        path: String(p).replace(/\\/g, '/'),
        inScope: inScope(p),
      })
    }
  }
}

const deny = findings.filter((f) => f.inScope && SEVERITY_RANK[f.severity] >= SEVERITY_RANK[THRESHOLD])
const outside = findings.filter((f) => !f.inScope && SEVERITY_RANK[f.severity] >= SEVERITY_RANK[THRESHOLD])

/** 按「包 × 严重度」去重展示，路径只留首个以便阅读 */
function summarize(list) {
  const map = new Map()
  for (const f of list) {
    const key = `${f.module}@${f.severity}`
    if (!map.has(key)) {
      map.set(key, { ...f, paths: 1 })
    } else {
      map.get(key).paths += 1
    }
  }
  return [...map.values()]
}

console.log(`[audit] 门槛=${THRESHOLD} · 可交付范围=${IN_SCOPE_PREFIXES.join(' , ')}`)
console.log(`[audit] 生产依赖漏洞总量：${findings.length} 条路径 / ${advisories.length} 条公告`)

if (outside.length > 0) {
  console.log('\n[audit] 范围外（apps/mobile Expo/RN 工具链，已记录为接受风险，不阻断）：')
  for (const f of summarize(outside)) {
    console.log(`  - ${f.module} [${f.severity}] ${f.advisory} patched=${f.patched} (${f.paths} 条路径)`)
  }
}

if (deny.length === 0) {
  console.log(`\n[audit] PASS —— 可交付范围内无 >= ${THRESHOLD} 的生产依赖漏洞`)
  process.exit(0)
}

console.error(`\n[audit] FAIL —— 可交付范围内存在 >= ${THRESHOLD} 的生产依赖漏洞：`)
for (const f of summarize(deny)) {
  console.error(`  - ${f.module} [${f.severity}] ${f.advisory} patched=${f.patched}`)
  console.error(`      ${f.title}`)
  console.error(`      ${f.url}`)
  console.error(`      path: ${f.path}`)
}
process.exit(1)
