#!/usr/bin/env node
/**
 * serve-dist.mjs —— 零依赖静态预览服务（SPA 回退）
 *
 * 用途：把 `expo export --platform web` 的产物（如 apps/mobile/dist-v15）起成本地
 *       可浏览的 URL，用于浏览器端 E2E / 人工验收。
 *
 * 用法：
 *   node scripts/serve-dist.mjs apps/mobile/dist-v15
 *   node scripts/serve-dist.mjs apps/mobile/dist-v15 --port 4181
 *   node scripts/serve-dist.mjs apps/mobile/dist-v15 --port 4181 --host 127.0.0.1
 *
 * 行为：
 *   · 默认绑定 127.0.0.1（不对外暴露）
 *   · SPA 回退：未知路径（且不含文件扩展名）回落到 index.html，
 *     这样 /workspace、/personal-plan 等客户端路由直接访问也能正常渲染
 *   · 带扩展名的路径（.js/.css/.png…）若不存在则如实 404，不回退 —— 便于发现资源缺失
 *   · 支持 Range 请求（音视频/字体拖动）
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
}

function parseArgs(argv) {
  let dir = null
  let port = 4181
  let host = '127.0.0.1'
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port' || a === '-p') port = Number(argv[++i])
    else if (a === '--host' || a === '-h') host = argv[++i]
    else if (!a.startsWith('-')) dir = a
  }
  return { dir, port, host }
}

const { dir, port, host } = parseArgs(process.argv.slice(2))

if (!dir) {
  console.error('用法: node scripts/serve-dist.mjs <dist目录> [--port 4181] [--host 127.0.0.1]')
  process.exit(1)
}

const root = path.resolve(dir)
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`[serve] 目录不存在: ${root}`)
  process.exit(1)
}
const indexPath = path.join(root, 'index.html')
if (!fs.existsSync(indexPath)) {
  console.error(`[serve] 未找到 index.html —— 该目录看起来不是 web 导出产物: ${root}`)
  process.exit(1)
}

function send(res, status, headers, body) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers })
  if (body === undefined) res.end()
  else res.end(body)
}

const server = http.createServer((req, res) => {
  let urlPath
  try {
    urlPath = decodeURIComponent(new URL(req.url, `http://${host}`).pathname)
  } catch {
    return send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad Request')
  }

  let filePath = path.join(root, urlPath)
  // 防目录穿越
  if (!filePath.startsWith(root)) {
    return send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Forbidden')
  }

  // 目录 → index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html')
  }

  const exists = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
  const hasExt = path.extname(urlPath) !== ''

  if (!exists) {
    // 带扩展名 ⇒ 真 404（暴露缺失资源）；无扩展名 ⇒ SPA 回退
    if (hasExt) {
      return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, `404 Not Found: ${urlPath}`)
    }
    filePath = indexPath
  }

  const stat = fs.statSync(filePath)
  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'

  // Range 支持
  const range = req.headers.range
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (m) {
      const start = m[1] === '' ? stat.size - Number(m[2]) : Number(m[1])
      const end = m[1] === '' || m[2] === '' ? stat.size - 1 : Number(m[2])
      if (start >= 0 && end < stat.size && start <= end) {
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Cache-Control': 'no-store',
        })
        return fs.createReadStream(filePath, { start, end }).pipe(res)
      }
    }
  }

  // 注意：文件响应不能走 send() —— pipe() 的返回值是目标流(res)本身，
  // 若当 body 再传给 res.end() 会抛 ERR_INVALID_ARG_TYPE 并崩掉进程。
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  })
  fs.createReadStream(filePath).pipe(res)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[serve] 端口 ${port} 已被占用，请换一个（--port <n>）`)
  } else {
    console.error(`[serve] 服务错误: ${err.message}`)
  }
  process.exit(1)
})

server.listen(port, host, () => {
  console.log(`[serve] 预览已启动`)
  console.log(`[serve]   URL     http://${host}:${port}`)
  console.log(`[serve]   目录    ${root}`)
  console.log(`[serve]   SPA回退 已开启（无扩展名路径 → index.html）`)
  console.log(`[serve]   Ctrl+C 停止`)
})
