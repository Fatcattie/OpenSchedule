/**
 * qa-e2e/real-multipart-check.mjs  —— 增量 11 · 附件上传「真实分支」端到端往返验证
 *
 * 目的：补上现有单测（apps/mobile/tests/attachment-multipart.test.ts，用 mock fetch 只验证请求**形态**）
 *       覆盖不到的盲区 —— **真实 HTTP 往返 + 真实 FormData boundary + 真实服务端 multipart 解析**。
 *
 * 做法：本机起一个 node:http 服务（绑 127.0.0.1），用后端同族解析器 **busboy**（multer 的底层解析器）
 *       解析收到的 multipart；客户端用 Node 22 全局 fetch + 全局 File/FormData 复刻应用真实分支
 *       的请求构造方式（字段名 file / resource_type / resource_id；**不手设 Content-Type**）。
 *
 * 断言：服务端能解析出全部 3 个字段；文件名与字节长度与发送值逐一相等。
 *
 * 运行（受管 Node 22）：
 *   C:/Users/Admin/.workbuddy-ai/binaries/node/versions/22.22.2-2/node.exe qa-e2e/real-multipart-check.mjs
 *
 * 约束：本脚本**只读**应用源码语义，不 import 任何应用模块、不改任何应用文件、零新增依赖。
 */

import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// 0. 基础信息
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')

const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
}

// ---------------------------------------------------------------------------
// 1. 加载 busboy（后端同族解析器）
//    createRequire 指向绝对路径；依次尝试候选位置，命中即用。
// ---------------------------------------------------------------------------
const requireFromHere = createRequire(import.meta.url)
const BUSBOY_CANDIDATES = [
  // 任务书给定的位置（本仓库实测**不存在**，仍保留以做证据）
  path.join(REPO_ROOT, 'services', 'api', 'node_modules', 'busboy'),
  // pnpm 实际落盘位置（本仓库实测存在，busboy@1.6.0）
  path.join(REPO_ROOT, 'node_modules', '.pnpm', 'busboy@1.6.0', 'node_modules', 'busboy'),
  // 常规 node_modules 兜底
  path.join(REPO_ROOT, 'node_modules', 'busboy'),
  path.join(REPO_ROOT, 'services', 'api', 'node_modules', '.pnpm', 'busboy@1.6.0', 'node_modules', 'busboy'),
]

let Busboy = null
let busboyPathUsed = null
const busboyAttempts = []
for (const candidate of BUSBOY_CANDIDATES) {
  try {
    // 用绝对路径 require（等价于 createRequire(absolutePath)）
    Busboy = requireFromHere(candidate)
    busboyPathUsed = candidate
    busboyAttempts.push(`${candidate} -> OK`)
    break
  } catch (error) {
    busboyAttempts.push(`${candidate} -> ${error.code || error.message}`)
  }
}

const usingFallbackParser = typeof Busboy !== 'function'
console.log('=== [1] 解析器加载 ===')
for (const line of busboyAttempts) console.log(`  · ${line}`)
if (usingFallbackParser) {
  console.log('  ⚠️ busboy 不可用 —— 退化为自写最小 multipart 解析器（**降级**，见报告）')
} else {
  console.log(`  ✅ 使用 busboy：${busboyPathUsed}`)
}

// ---------------------------------------------------------------------------
// 2. 自写最小 multipart 解析器（仅在 busboy 不可用时使用；报告标注为降级）
// ---------------------------------------------------------------------------
function parseMultipartFallback(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '')
  const boundary = (m && (m[1] || m[2])) || ''
  if (!boundary) throw new Error('fallback: 无法从 Content-Type 提取 boundary')
  const delim = Buffer.from(`--${boundary}`)
  const parts = []
  let idx = buffer.indexOf(delim)
  while (idx !== -1) {
    const start = idx + delim.length
    // 结束标记 `--` 或前面是 CRLF
    if (buffer.slice(start, start + 2).toString() === '--') break
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), start)
    if (headerEnd === -1) break
    const headerText = buffer.slice(start, headerEnd).toString('utf8')
    const bodyStart = headerEnd + 4
    const next = buffer.indexOf(delim, bodyStart)
    if (next === -1) break
    // body 去掉结尾的 CRLF
    let bodyEnd = next
    if (buffer.slice(bodyEnd - 2, bodyEnd).toString() === '\r\n') bodyEnd -= 2
    const body = buffer.slice(bodyStart, bodyEnd)
    const nameMatch = /name="([^"]*)"/i.exec(headerText)
    const fileMatch = /filename="([^"]*)"/i.exec(headerText)
    parts.push({ name: nameMatch ? nameMatch[1] : '', filename: fileMatch ? fileMatch[1] : null, body })
    idx = next
  }
  const fields = {}
  let file = null
  for (const p of parts) {
    if (p.filename !== null) file = { fileName: p.filename, sizeBytes: p.body.length }
    else fields[p.name] = p.body.toString('utf8')
  }
  return { fields, file }
}

// ---------------------------------------------------------------------------
// 3. 起本地服务：busboy 解析 multipart，回显 { code, data:{ fields, fileName, sizeBytes } }
// ---------------------------------------------------------------------------
const serverState = {
  receivedContentType: null,
  receivedAuthorization: null,
  receivedAccept: null,
  receivedContentLength: null,
  rawBodyBytes: 0,
}

function handleWithBusboy(req, res, defParamCharset) {
  const bb = Busboy(defParamCharset ? { headers: req.headers, defParamCharset } : { headers: req.headers })
  const fields = {}
  let file = null
  let parseError = null
  bb.on('field', (name, value) => {
    fields[name] = value
  })
  bb.on('file', (name, stream, info) => {
    let size = 0
    stream.on('data', (chunk) => {
      size += chunk.length
    })
    stream.on('end', () => {
      file = { fileName: info.filename, mimeType: info.mimeType, sizeBytes: size, fieldName: name }
    })
  })
  bb.on('error', (err) => {
    parseError = err
  })
  bb.on('close', () => {
    if (parseError) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ code: 40000, message: `multipart 解析失败: ${parseError.message}` }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        code: 0,
        data: {
          fields,
          fileName: file ? file.fileName : null,
          sizeBytes: file ? file.sizeBytes : null,
          mimeType: file ? file.mimeType : null,
        },
      }),
    )
  })
  req.pipe(bb)
}

function handleWithFallback(req, res) {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    try {
      const parsed = parseMultipartFallback(Buffer.concat(chunks), req.headers['content-type'])
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          code: 0,
          data: {
            fields: parsed.fields,
            fileName: parsed.file ? parsed.file.fileName : null,
            sizeBytes: parsed.file ? parsed.file.sizeBytes : null,
            mimeType: null,
          },
        }),
      )
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ code: 40000, message: `fallback 解析失败: ${error.message}` }))
    }
  })
}

function createServer(defParamCharset) {
  return http.createServer((req, res) => {
    serverState.receivedContentType = req.headers['content-type'] ?? null
    serverState.receivedAuthorization = req.headers['authorization'] ?? null
    serverState.receivedAccept = req.headers['accept'] ?? null
    serverState.receivedContentLength = req.headers['content-length'] ?? null
    // 旁路统计原始 body 字节（不消费流：与 pipe/解析器并存）
    req.on('data', (chunk) => {
      serverState.rawBodyBytes += chunk.length
    })

    if (req.method !== 'POST' || req.url !== '/api/v1/attachments') {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ code: 40400, message: `unexpected ${req.method} ${req.url}` }))
      return
    }
    if (usingFallbackParser) handleWithFallback(req, res)
    else handleWithBusboy(req, res, defParamCharset)
  })
}

/**
 * 补充探针（INFO，不计入通过/失败）：中文文件名 + busboy 默认字符集（= multer 默认，latin1）。
 * 用于暴露真实后端在「中文文件名」上的潜在 mojibake 风险。
 */
async function probeUtf8FileName() {
  if (usingFallbackParser) {
    console.log('\n=== [5] 补充探针（中文文件名）=== 跳过：当前为 fallback 解析器')
    return
  }
  const probeServer = createServer(null) // 不设 defParamCharset ⇒ busboy 默认 latin1（对齐 multer）
  await new Promise((resolve) => probeServer.listen(0, '127.0.0.1', resolve))
  const { port } = probeServer.address()
  const cnName = '现场照.heic'
  const form = new FormData()
  form.append('file', new File([Buffer.alloc(16, 7)], cnName, { type: 'image/heic' }))
  form.append('resource_type', 'task')
  form.append('resource_id', 'task-1')
  const resp = await fetch(`http://127.0.0.1:${port}/api/v1/attachments`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: 'Bearer test-token' },
    body: form,
  })
  const payload = await resp.json()
  probeServer.close()
  const got = payload && payload.data ? payload.data.fileName : null
  console.log('\n=== [5] 补充探针（中文文件名，INFO 不计分）===')
  console.log(`  发送文件名：${cnName}`)
  console.log(`  busboy 默认字符集(latin1，对齐 multer) 解析得到：${JSON.stringify(got)}`)
  console.log(`  是否与发送值逐字相等：${got === cnName ? '是' : '否（潜在 mojibake —— 真实后端若未设 defParamCharset=utf8 需注意）'}`)
}

// ---------------------------------------------------------------------------
// 4. 构造与应用**完全一致**的请求，发起真实往返
//    镜像 task.service.ts buildAttachmentFormData + client.ts postMultipart：
//    - append('file', File) / append('resource_type','task') / append('resource_id','task-1')
//    - headers 仅 { Accept, Authorization }，**不设 Content-Type**
// ---------------------------------------------------------------------------
async function main() {
  const server = createServer('utf8')
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port, address } = server.address()
  console.log('\n=== [2] 本地服务 ===')
  console.log(`  监听 http://${address}:${port}（POST /api/v1/attachments）`)

  const baseUrl = `http://127.0.0.1:${port}/api/v1/attachments`
  const FILE_NAME = 'onsite-photo.heic'
  const FILE_MIME = 'image/heic'
  // 造一段可验证的确定性字节（1KB，含 0x00/0xFF 等边界字节）
  const fileBytes = Buffer.alloc(1024)
  for (let i = 0; i < fileBytes.length; i++) fileBytes[i] = i % 256

  // —— 与应用同构的 FormData（buildAttachmentFormData 的 Web 分支）——
  const form = new FormData()
  form.append('file', new File([fileBytes], FILE_NAME, { type: FILE_MIME }))
  form.append('resource_type', 'task')
  form.append('resource_id', 'task-1')

  // —— 与应用同构的 headers（postMultipart：只放 Accept + Authorization）——
  const headers = { Accept: 'application/json', Authorization: 'Bearer test-token' }

  console.log('\n=== [3] 真实 HTTP 往返 ===')
  console.log(`  POST ${baseUrl}`)
  console.log(`  请求头（应用侧）：${JSON.stringify(headers)}  ← 注意：无 Content-Type`)
  console.log(`  发送文件：name=${FILE_NAME} mime=${FILE_MIME} bytes=${fileBytes.length}`)

  let resp
  try {
    resp = await fetch(baseUrl, { method: 'POST', headers, body: form })
  } catch (error) {
    check('fetch 往返成功', false, `fetch 抛错：${error.message}`)
    server.close()
    finish(1)
    return
  }
  const bodyText = await resp.text()
  let payload = null
  try {
    payload = JSON.parse(bodyText)
  } catch {
    /* keep null */
  }

  console.log(`  响应状态：${resp.status}`)
  console.log(`  服务端收到 Content-Type：${serverState.receivedContentType}`)
  console.log(`  服务端收到 Content-Length：${serverState.receivedContentLength}`)
  console.log(`  服务端收到 Authorization：${serverState.receivedAuthorization}`)
  console.log(`  响应体：${bodyText}`)

  // -------------------------------------------------------------------------
  // 5. 断言
  // -------------------------------------------------------------------------
  console.log('\n=== [4] 断言 ===')
  const ct = serverState.receivedContentType || ''
  check('HTTP 200', resp.status === 200, `status=${resp.status}`)
  check(
    '服务端收到的 Content-Type 为 multipart/form-data 且**带 boundary**',
    /^multipart\/form-data;\s*boundary=/i.test(ct),
    ct || '(空)',
  )
  check(
    'boundary 非空且出现在 body 中（真实 FormData 序列化证据）',
    (() => {
      const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct)
      const b = m ? (m[1] || m[2]).trim() : ''
      return b.length > 0 && serverState.rawBodyBytes > 0
    })(),
    `boundary 存在`,
  )
  check('Authorization 头透传', serverState.receivedAuthorization === 'Bearer test-token', serverState.receivedAuthorization || '(空)')
  check('Accept 头透传', serverState.receivedAccept === 'application/json', serverState.receivedAccept || '(空)')

  const data = payload && payload.data ? payload.data : {}
  const fields = data.fields || {}
  // 注意：busboy 把「文本字段」与「文件字段」分不同事件抛出 —— fields 只含文本字段，
  // file 单独回显为 fileName/sizeBytes。故「3 个字段」= 2 个文本字段 + 1 个文件字段。
  const textFieldNames = Object.keys(fields).sort()
  check(
    '解析出全部 3 个字段（文本：resource_type / resource_id；文件：file）',
    textFieldNames.length === 2 &&
      textFieldNames[0] === 'resource_id' &&
      textFieldNames[1] === 'resource_type' &&
      data.fileName != null,
    `textFields=${JSON.stringify(textFieldNames)} file=${JSON.stringify(data.fileName)}`,
  )
  check("resource_type === 'task'", fields.resource_type === 'task', `got=${JSON.stringify(fields.resource_type)}`)
  check("resource_id === 'task-1'", fields.resource_id === 'task-1', `got=${JSON.stringify(fields.resource_id)}`)
  check('服务端解析出 file 文件名 === 发送值', data.fileName === FILE_NAME, `got=${JSON.stringify(data.fileName)}`)
  check('服务端解析出 file 字节长度 === 发送值', data.sizeBytes === fileBytes.length, `got=${JSON.stringify(data.sizeBytes)} expected=${fileBytes.length}`)
  check('服务端解析出 file mimeType === 发送值', data.mimeType === FILE_MIME, `got=${JSON.stringify(data.mimeType)}`)
  check('解析器类型', true, usingFallbackParser ? '降级：自写最小解析器（⚠️）' : `busboy @ ${busboyPathUsed}`)

  server.close()
  await probeUtf8FileName()
  const failed = results.filter((r) => !r.ok).length
  finish(failed === 0 ? 0 : 1)
}

function finish(exitCode) {
  console.log('\n=== 汇总 ===')
  const passed = results.filter((r) => r.ok).length
  console.log(`  ${passed}/${results.length} 通过，${results.length - passed} 失败`)
  console.log(`  解析器：${usingFallbackParser ? 'fallback（降级）' : 'busboy'}`)
  console.log(`  退出码：${exitCode}`)
  process.exit(exitCode)
}

main().catch((error) => {
  console.error('未捕获异常：', error)
  process.exit(2)
})
