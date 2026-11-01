#!/usr/bin/env node
/**
 * Alertmanager → IM 机器人通知桥（零依赖，Node 22 内置 http/crypto/fetch）。
 *
 * 为什么需要它：Alertmanager 原生 receiver 不支持飞书/钉钉/企业微信群机器人的消息格式，
 * 而它们是本项目团队的主要值班通道。本桥接收 Alertmanager webhook（v4 payload），
 * 渲染为中文文本后并发投递到已配置的通道；任一已配置通道失败即返回 502，让 Alertmanager 按其退避重试。
 *
 * 环境变量（均可选；全部留空时桥只记日志，`/health` 会标明 channels=[]）：
 *   ALERT_FEISHU_WEBHOOK    飞书群机器人地址   ALERT_FEISHU_SECRET    飞书「签名校验」密钥（可选）
 *   ALERT_DINGTALK_WEBHOOK  钉钉群机器人地址   ALERT_DINGTALK_SECRET  钉钉「加签」密钥（可选）
 *   ALERT_WECOM_WEBHOOK     企业微信群机器人地址
 *   ALERT_WEBHOOK_URL       通用 webhook：原样转发 Alertmanager JSON（对接自有值班系统）
 *   ALERT_BRIDGE_PORT       监听端口（默认 9094）
 *   ALERT_TIMEZONE          时间显示时区（默认 Asia/Shanghai）
 *
 * 端点：POST /alertmanager（Alertmanager webhook_configs.url）· GET /health
 * 仅内部网络使用（compose 不发布端口），机器人地址属凭据，日志只打印通道名不打印 URL。
 */
import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

/** 各机器人单条文本上限（企业微信 2048 字节最严，统一按字符留余量） */
export const MAX_TEXT_LENGTH = 1800
const SEND_TIMEOUT_MS = 5000
const MAX_BODY_BYTES = 1024 * 1024

/** 从环境变量解析已配置通道（纯函数） */
export function resolveChannels(env = process.env) {
  const channels = []
  const pick = (name) => (env[name] ?? '').trim()
  if (pick('ALERT_FEISHU_WEBHOOK')) {
    channels.push({ kind: 'feishu', url: pick('ALERT_FEISHU_WEBHOOK'), secret: pick('ALERT_FEISHU_SECRET') })
  }
  if (pick('ALERT_DINGTALK_WEBHOOK')) {
    channels.push({ kind: 'dingtalk', url: pick('ALERT_DINGTALK_WEBHOOK'), secret: pick('ALERT_DINGTALK_SECRET') })
  }
  if (pick('ALERT_WECOM_WEBHOOK')) channels.push({ kind: 'wecom', url: pick('ALERT_WECOM_WEBHOOK') })
  if (pick('ALERT_WEBHOOK_URL')) channels.push({ kind: 'webhook', url: pick('ALERT_WEBHOOK_URL') })
  return channels
}

function formatTime(iso, timeZone) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 2000) return '-'
  return date.toLocaleString('zh-CN', { timeZone, hour12: false })
}

/** Alertmanager v4 payload → 中文文本（纯函数） */
export function formatAlertText(payload, { timeZone = 'Asia/Shanghai' } = {}) {
  const alerts = Array.isArray(payload?.alerts) ? payload.alerts : []
  const firing = alerts.filter((a) => a.status === 'firing')
  const resolved = alerts.filter((a) => a.status === 'resolved')
  const name = payload?.groupLabels?.alertname ?? payload?.commonLabels?.alertname ?? '告警'
  const severity = payload?.commonLabels?.severity
  const head =
    payload?.status === 'resolved'
      ? `✅【已恢复】${name}`
      : `🚨【${severity === 'critical' ? '严重' : severity === 'warning' ? '警告' : '告警'}】${name}`
  const lines = [`${head}（触发 ${firing.length} · 恢复 ${resolved.length}）`]
  for (const alert of alerts) {
    const labels = alert.labels ?? {}
    const ann = alert.annotations ?? {}
    lines.push('')
    lines.push(`• [${alert.status === 'resolved' ? '恢复' : '触发'}] ${ann.summary ?? labels.alertname ?? ''}`)
    if (ann.description) lines.push(`  ${ann.description}`)
    const where = [labels.service, labels.instance].filter(Boolean).join(' / ')
    if (where) lines.push(`  对象：${where}`)
    lines.push(
      alert.status === 'resolved'
        ? `  时间：${formatTime(alert.startsAt, timeZone)} → ${formatTime(alert.endsAt, timeZone)}`
        : `  开始：${formatTime(alert.startsAt, timeZone)}`,
    )
  }
  lines.push('', '处置手册：docs/ops/runbook.md「告警处置」')
  const text = lines.join('\n')
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 16)}\n…（已截断）` : text
}

/** 飞书签名：key = `${timestamp}\n${secret}`，对空消息做 HMAC-SHA256 后 base64（官方算法） */
export function feishuSign(timestampSeconds, secret) {
  return createHmac('sha256', `${timestampSeconds}\n${secret}`).update('').digest('base64')
}

/** 钉钉加签：key = secret，消息 = `${timestampMs}\n${secret}`，HMAC-SHA256 后 base64（官方算法） */
export function dingtalkSign(timestampMs, secret) {
  return createHmac('sha256', secret).update(`${timestampMs}\n${secret}`).digest('base64')
}

/** 构造各通道请求（纯函数，便于测试） */
export function buildRequest(channel, text, payload, now = Date.now()) {
  switch (channel.kind) {
    case 'feishu': {
      const body = { msg_type: 'text', content: { text } }
      if (channel.secret) {
        const ts = Math.floor(now / 1000)
        Object.assign(body, { timestamp: String(ts), sign: feishuSign(ts, channel.secret) })
      }
      return { url: channel.url, body }
    }
    case 'dingtalk': {
      let url = channel.url
      if (channel.secret) {
        const sep = url.includes('?') ? '&' : '?'
        url += `${sep}timestamp=${now}&sign=${encodeURIComponent(dingtalkSign(now, channel.secret))}`
      }
      return { url, body: { msgtype: 'text', text: { content: text } } }
    }
    case 'wecom':
      return { url: channel.url, body: { msgtype: 'text', text: { content: text } } }
    default:
      return { url: channel.url, body: payload }
  }
}

/** 机器人「HTTP 200 但业务失败」的识别：飞书 code / StatusCode，钉钉与企业微信 errcode */
export function isBusinessError(kind, json) {
  if (!json || typeof json !== 'object') return false
  if (kind === 'feishu') return (json.code ?? json.StatusCode ?? 0) !== 0
  if (kind === 'dingtalk' || kind === 'wecom') return (json.errcode ?? 0) !== 0
  return false
}

async function deliver(channel, text, payload, fetchImpl) {
  const { url, body } = buildRequest(channel, text, payload)
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const raw = await res.text()
  let json = null
  try {
    json = raw ? JSON.parse(raw) : null
  } catch {
    /* 通用 webhook 可能返回非 JSON */
  }
  if (isBusinessError(channel.kind, json)) throw new Error(`业务错误 ${raw.slice(0, 200)}`)
}

/** 投递到全部通道；返回每个通道结果（不抛） */
export async function dispatch(payload, channels, { fetchImpl = fetch, timeZone } = {}) {
  const text = formatAlertText(payload, { timeZone })
  const results = await Promise.allSettled(channels.map((c) => deliver(c, text, payload, fetchImpl)))
  return results.map((r, i) => ({
    kind: channels[i].kind,
    ok: r.status === 'fulfilled',
    ...(r.status === 'rejected' ? { error: String(r.reason?.message ?? r.reason) } : {}),
  }))
}

function log(level, event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ level, time: new Date().toISOString(), event, ...fields })}\n`)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** 创建 HTTP 服务（测试可注入 channels/fetchImpl） */
export function createBridgeServer({ channels = resolveChannels(), fetchImpl = fetch, timeZone } = {}) {
  const tz = timeZone ?? (process.env.ALERT_TIMEZONE || 'Asia/Shanghai')
  return createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.method === 'GET' && req.url === '/health') {
      return reply(200, { status: 'ok', channels: channels.map((c) => c.kind) })
    }
    if (req.method !== 'POST' || req.url !== '/alertmanager') return reply(404, { error: 'not found' })

    let payload
    try {
      payload = JSON.parse(await readBody(req))
    } catch (err) {
      return reply(400, { error: `invalid payload: ${err.message}` })
    }
    if (channels.length === 0) {
      log('warn', 'alert_bridge_no_channel', { alerts: payload?.alerts?.length ?? 0 })
      return reply(200, { delivered: [] })
    }
    const results = await dispatch(payload, channels, { fetchImpl, timeZone: tz })
    const failed = results.filter((r) => !r.ok)
    log(failed.length ? 'error' : 'info', 'alert_bridge_dispatch', {
      status: payload?.status,
      alertname: payload?.groupLabels?.alertname,
      results,
    })
    // 任一通道失败 → 502，Alertmanager 退避重试（成功通道可能收到重复消息，值班侧可接受）
    return reply(failed.length ? 502 : 200, { delivered: results })
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.ALERT_BRIDGE_PORT || 9094)
  const server = createBridgeServer()
  server.listen(port, () => {
    log('info', 'alert_bridge_started', { port, channels: resolveChannels().map((c) => c.kind) })
  })
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)))
}
