// qa-e2e/stub-api.mjs —— 零依赖本地桩服务（仅用于 QA 端到端验证，禁止修改应用源码）
//
// 职责：
//  1) 静态伺服 apps/mobile/dist-real（真实分支 Web 产物），带 SPA 回退（非 /api 的未知路径 → index.html）；
//  2) 同源提供 /api/v1/* 桩接口（应用 API_BASE 是相对路径 '/api/v1'，必须同源）；
//  3) 记录**所有**请求路径到 stdout 与 qa-e2e/.stub-requests.log，便于观察应用需要哪些端点；
//  4) POST /api/v1/attachments 用 busboy 解析 multipart，落盘证据（文件名/大小/字段）并返回附件对象。
//
// 运行： node qa-e2e/stub-api.mjs [--port 4200] [--host 127.0.0.1]
// 依赖： 无（busboy 从仓库内 node_modules 经 createRequire 取，不新增 npm 依赖）

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')
const DIST_DIR = path.join(REPO_ROOT, 'apps', 'mobile', 'dist-real')
const LOG_FILE = path.join(__dirname, '.stub-requests.log')
const UPLOAD_EVIDENCE_FILE = path.join(__dirname, '.stub-uploads.json')

// ── 参数 ────────────────────────────────────────────────────────────
function argValue(flag, fallback) {
  const idx = process.argv.indexOf(flag)
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]
  return fallback
}
const PORT = Number(argValue('--port', '4200'))
const HOST = argValue('--host', '127.0.0.1')

// ── busboy 解析器加载（多路径兜底）────────────────────────────────────
function loadBusboy() {
  const candidates = [
    path.join(REPO_ROOT, 'services', 'api', 'package.json'),
    path.join(REPO_ROOT, 'package.json'),
    path.join(REPO_ROOT, 'node_modules', '.pnpm', 'node_modules', 'busboy', 'package.json'),
    path.join(REPO_ROOT, 'node_modules', '.pnpm', 'busboy@1.6.0', 'node_modules', 'busboy', 'package.json'),
  ]
  for (const base of candidates) {
    try {
      const req = createRequire(base)
      return { mod: req('busboy'), from: base }
    } catch {
      /* try next */
    }
  }
  // 最后兜底：直接按绝对路径 require（pnpm 虚拟 store 的 hoisted 目录）
  const abs = path.join(REPO_ROOT, 'node_modules', '.pnpm', 'node_modules', 'busboy')
  const req = createRequire(path.join(REPO_ROOT, 'package.json'))
  return { mod: req(abs), from: abs }
}
let Busboy
let busboyFrom
try {
  const loaded = loadBusboy()
  Busboy = loaded.mod
  busboyFrom = loaded.from
  console.log(`[stub] busboy 已加载：${busboyFrom}`)
} catch (err) {
  console.error('[stub] 无法加载 busboy：', err?.message)
  Busboy = null
}

// ── 日志 ────────────────────────────────────────────────────────────
function log(line) {
  const stamp = new Date().toISOString()
  const text = `[${stamp}] ${line}`
  console.log(text)
  try {
    fs.appendFileSync(LOG_FILE, text + '\n')
  } catch {
    /* ignore */
  }
}

// ── 种子数据（对齐 seed.ts 的 task-001 形状）──────────────────────────
const TENANT_ID = 'tenant-001'
const DAY_MS = 86_400_000
const DEMO_TZ_OFFSET_MS = 8 * 60 * 60 * 1000
function demoDayAt(offsetDays, hour, minute = 0) {
  const now = new Date()
  const local = new Date(now.getTime() + DEMO_TZ_OFFSET_MS)
  const utcMs =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, minute, 0, 0) -
    DEMO_TZ_OFFSET_MS +
    offsetDays * DAY_MS
  return new Date(utcMs).toISOString()
}
const day = (offsetDays) => demoDayAt(offsetDays, 18, 0)

const USER = {
  id: 'user-001',
  email: 'zhangwei@example.com',
  displayName: '张伟',
  avatarUrl: null,
  locale: 'zh-CN',
  timezone: 'Asia/Shanghai',
  status: 'active',
  phone: '138-0000-0001',
  bio: '负责官网改版的前端与体验落地',
  motto: '把复杂留给自己，把简单留给用户',
  createdAt: '2026-01-10T08:00:00.000Z',
  updatedAt: '2026-01-10T08:00:00.000Z',
}

const TENANT = { id: TENANT_ID, name: '北极星研发组', plan: 'pro', status: 'active' }

const PROJECT = {
  id: 'project-001',
  tenantId: TENANT_ID,
  name: '官网改版 2026 Q3',
  description: '官网 2.0 改版：视觉升级 + 内容重构 + 性能优化',
  ownerId: 'user-001',
  status: 'active',
  deadline: demoDayAt(45, 18, 0),
  workflowId: null,
  createdBy: 'user-001',
  createdAt: day(-30),
  updatedAt: day(-2),
}

const TASK_001 = {
  id: 'task-001',
  tenantId: TENANT_ID,
  projectId: 'project-001',
  parentId: null,
  title: '需求文档评审',
  description: '与产品确认 V2 需求范围，输出评审结论与待确认清单。',
  status: 'todo',
  priority: 'high',
  assigneeId: 'user-001',
  startAt: demoDayAt(0, 9, 0),
  dueAt: demoDayAt(0, 18, 0),
  endAt: demoDayAt(0, 10, 30),
  estimatedHours: 4,
  actualHours: null,
  completedAt: null,
  startedAt: null,
  createdBy: 'user-001',
  tags: ['评审', '需求'],
  sortOrder: 1,
  workflowColumnId: null,
  isAiGenerated: false,
  version: 1,
  createdAt: day(-5),
  updatedAt: day(-1),
}

// 内存附件库（POST 上传后加入；GET 列表返回它）
const attachments = []
let uploadSeq = 0

// ── 响应工具 ────────────────────────────────────────────────────────
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}
const ok = (res, data) => sendJson(res, 200, { code: 0, data, message: 'ok' })

// ── 静态文件 ────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

function serveStatic(res, urlPath) {
  // 去掉查询串，规范化，防目录穿越
  let rel = decodeURIComponent(urlPath.split('?')[0])
  if (rel.endsWith('/')) rel += 'index.html'
  const target = path.join(DIST_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''))
  if (!target.startsWith(DIST_DIR)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  fs.stat(target, (err, stat) => {
    if (!err && stat.isFile()) {
      const ext = path.extname(target).toLowerCase()
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
      fs.createReadStream(target).pipe(res)
      return
    }
    // SPA 回退：非 /api 的未知路径 → index.html
    const indexPath = path.join(DIST_DIR, 'index.html')
    fs.readFile(indexPath, (e2, buf) => {
      if (e2) {
        res.writeHead(404)
        res.end('Not Found (dist-real/index.html missing — run the export first)')
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(buf)
    })
  })
}

// ── multipart 解析 ──────────────────────────────────────────────────
function handleUpload(req, res, urlPath) {
  if (!Busboy) {
    log(`POST ${urlPath} → 500（busboy 不可用）`)
    return sendJson(res, 500, { code: 50000, message: 'stub: busboy unavailable', data: null })
  }
  const contentType = req.headers['content-type'] || ''
  const record = {
    at: new Date().toISOString(),
    path: urlPath,
    contentType,
    contentLength: req.headers['content-length'] || null,
    authorization: req.headers['authorization'] || null,
    textFields: {},
    file: null,
  }
  let bb
  try {
    bb = Busboy({ headers: req.headers })
  } catch (err) {
    log(`POST ${urlPath} → 400（busboy 解析头失败：${err?.message}）`)
    return sendJson(res, 400, { code: 40000, message: 'stub: bad multipart', data: null })
  }

  bb.on('field', (name, val) => {
    record.textFields[name] = val
  })
  bb.on('file', (name, stream, info) => {
    let size = 0
    const chunks = []
    stream.on('data', (d) => {
      size += d.length
      if (chunks.length < 4) chunks.push(d)
    })
    stream.on('end', () => {
      record.file = {
        field: name,
        fileName: info.filename,
        mimeType: info.mimeType,
        encoding: info.encoding,
        sizeBytes: size,
        previewHead: Buffer.concat(chunks).slice(0, 16).toString('hex'),
      }
    })
  })
  bb.on('close', () => {
    uploadSeq += 1
    const file = record.file || {}
    const resourceType = record.textFields.resource_type || 'task'
    const resourceId = record.textFields.resource_id || ''
    const attachment = {
      id: `att-stub-${String(uploadSeq).padStart(3, '0')}`,
      tenantId: TENANT_ID,
      resourceType,
      resourceId,
      objectKey: `${TENANT_ID}/${resourceId}/${file.fileName || 'unknown'}`,
      fileName: file.fileName || 'unknown',
      mimeType: file.mimeType || 'application/octet-stream',
      sizeBytes: file.sizeBytes ?? 0,
      uploaderId: USER.id,
      createdAt: new Date().toISOString(),
    }
    attachments.push(attachment)
    record.attachment = attachment
    record.hasBoundary = /boundary=/.test(contentType)

    // 证据落盘
    try {
      let arr = []
      try {
        arr = JSON.parse(fs.readFileSync(UPLOAD_EVIDENCE_FILE, 'utf8'))
      } catch {
        arr = []
      }
      arr.push(record)
      fs.writeFileSync(UPLOAD_EVIDENCE_FILE, JSON.stringify(arr, null, 2))
    } catch {
      /* ignore */
    }

    log(
      `POST ${urlPath} → 200 | boundary=${record.hasBoundary} | textFields=${JSON.stringify(
        record.textFields,
      )} | file=${JSON.stringify(file)} | 返回 id=${attachment.id}`,
    )
    ok(res, {
      id: attachment.id,
      resourceType: attachment.resourceType,
      resourceId: attachment.resourceId,
      objectKey: attachment.objectKey,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      createdAt: attachment.createdAt,
    })
  })
  bb.on('error', (err) => {
    log(`POST ${urlPath} → 500（busboy error：${err?.message}）`)
    sendJson(res, 500, { code: 50000, message: 'stub: multipart error', data: null })
  })
  req.pipe(bb)
}

// ── API 路由 ────────────────────────────────────────────────────────
function handleApi(req, res, url) {
  const urlPath = url.pathname
  const method = req.method || 'GET'
  log(`API ${method} ${urlPath}${url.search || ''} | auth=${req.headers['authorization'] ? 'yes' : 'no'}`)

  if (method === 'POST' && urlPath === '/api/v1/auth/login') {
    return ok(res, { accessToken: `stub.access.${Date.now()}`, refreshToken: `stub.refresh.${Date.now()}` })
  }
  if (method === 'GET' && urlPath === '/api/v1/auth/me') {
    return ok(res, { user: USER, tenant: TENANT, roles: ['manager', 'member'] })
  }
  // 注意：必须早于下面的 /tasks/:id 正则（否则 'audit' 会被当作 taskId）
  if (method === 'GET' && urlPath === '/api/v1/tasks/audit') {
    return ok(res, [])
  }
  const taskMatch = urlPath.match(/^\/api\/v1\/tasks\/([^/]+)$/)
  if (method === 'GET' && taskMatch) {
    const taskId = taskMatch[1]
    const task = taskId === 'task-001' ? TASK_001 : { ...TASK_001, id: taskId }
    return ok(res, {
      task,
      assignee: task.assigneeId === USER.id ? USER : null,
      project: PROJECT,
      comments: [],
      attachments: attachments.filter((a) => a.resourceId === taskId),
      timeEntries: [],
      dependencies: [],
    })
  }
  if (method === 'GET' && urlPath === '/api/v1/attachments') {
    const resourceId = url.searchParams.get('resource_id')
    const resourceType = url.searchParams.get('resource_type')
    const items = attachments.filter(
      (a) => (!resourceId || a.resourceId === resourceId) && (!resourceType || a.resourceType === resourceType),
    )
    return ok(res, items)
  }
  if (method === 'POST' && urlPath === '/api/v1/attachments') {
    return handleUpload(req, res, urlPath)
  }

  // ── 应用外壳（工作台等）依赖的「对象形状」端点：返回空聚合体，避免渲染期崩溃 ──
  if (method === 'GET' && urlPath === '/api/v1/me/summaries') {
    const now = new Date()
    const start = new Date(now.getTime() - 7 * DAY_MS)
    return ok(res, {
      period: 'week',
      window: { start: start.toISOString(), end: now.toISOString() },
      stats: { completedCount: 0, onTimeCount: 0, overdueCount: 0, actualHoursTotal: 0, onTimeRate: null },
      overdueTasks: [],
      completedTasks: [],
    })
  }
  if (method === 'GET' && urlPath === '/api/v1/notifications/unread-count') {
    return ok(res, 0)
  }
  if (method === 'GET' && urlPath === '/api/v1/notifications') {
    return ok(res, [])
  }
  if (method === 'GET' && urlPath === '/api/v1/audit-logs') {
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '5')
    return ok(res, { items: [], total: 0, page, pageSize })
  }
  if (method === 'GET' && urlPath === '/api/v1/tasks') {
    // 列表类端点（我的待办 / 临期 / 项目任务）——空列表即可
    return ok(res, [])
  }

  // 兜底：GET 返回空数组（避免应用外壳崩溃）；其它方法返回空对象
  if (method === 'GET') return ok(res, [])
  return ok(res, {})
}

// ── 服务器 ──────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`)
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url)
  log(`STATIC ${req.method} ${url.pathname}`)
  return serveStatic(res, url.pathname)
})

server.listen(PORT, HOST, () => {
  log(`[stub] 监听 http://${HOST}:${PORT} | 静态目录=${DIST_DIR}`)
  log(`[stub] 请求日志=${LOG_FILE}`)
  log(`[stub] 上传证据=${UPLOAD_EVIDENCE_FILE}`)
})

process.on('SIGINT', () => {
  log('[stub] SIGINT，退出')
  process.exit(0)
})
process.on('SIGTERM', () => {
  log('[stub] SIGTERM，退出')
  process.exit(0)
})
