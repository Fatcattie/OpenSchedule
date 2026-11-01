/**
 * 职责：浏览器端错误上报（Sentry Envelope 直连，零依赖；与 services/api/src/common/observability/sentry.ts 同口径）
 *
 * - 不引入 @sentry/browser：与主服务 R9 决策一致（审计面零新增），只实现官方公开的 Envelope 协议
 * - DSN 运行时注入：生产镜像由 nginx 启动脚本写出 /runtime-config.js（window.__OS_RUNTIME__），
 *   同一不可变镜像可在 staging/prod 复用；本地开发回落 VITE_SENTRY_DSN；都为空则完全 no-op
 * - 鉴权走查询串（sentry_key/sentry_version）+ text/plain：属 CORS 简单请求，无预检
 * - 只上报：未捕获异常（window.error）、未处理 Promise 拒绝、React 错误边界；API 5xx 由主服务自报，不重复
 * - 凭据脱敏、页面 URL 去查询串、每分钟限流 + 同消息去重、扩展程序注入的错误直接丢弃
 */

const SDK_NAME = 'openschedule.web.envelope'
const SDK_VERSION = '1.0.0'
/** 单页面每分钟最多上报事件数 */
export const MAX_EVENTS_PER_MINUTE = 10
/** 同一消息在该窗口内只报一次（防渲染循环刷屏） */
const DEDUPE_WINDOW_MS = 60_000
const MAX_MESSAGE_LENGTH = 2000
const MAX_FRAMES = 30

export interface RuntimeConfig {
  sentryDsn?: string
  environment?: string
  release?: string
}

declare global {
  interface Window {
    __OS_RUNTIME__?: RuntimeConfig
  }
}

export interface ErrorReportingOptions {
  publicKey: string
  envelopeUrl: string
  environment: string
  release?: string
}

export interface StackFrame {
  filename: string
  function?: string
  lineno?: number
  colno?: number
  in_app: boolean
}

/** 解析 DSN（纯函数）：`https://<publicKey>@<host>[/<prefix>]/<projectId>`；非法返回 null */
export function parseDsn(raw: string | undefined): { publicKey: string; envelopeUrl: string } | null {
  const value = raw?.trim()
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (!url.username || !url.host) return null
  const segments = url.pathname.split('/').filter(Boolean)
  const projectId = segments.pop()
  if (!projectId || !/^\d+$/.test(projectId)) return null
  const prefix = segments.length > 0 ? `/${segments.join('/')}` : ''
  const publicKey = decodeURIComponent(url.username)
  return {
    publicKey,
    envelopeUrl:
      `${url.protocol}//${url.host}${prefix}/api/${projectId}/envelope/` +
      `?sentry_version=7&sentry_key=${encodeURIComponent(publicKey)}&sentry_client=${SDK_NAME}%2F${SDK_VERSION}`,
  }
}

/** 解析上报配置（纯函数）：运行时注入优先，构建期变量兜底 */
export function resolveOptions(
  runtime: RuntimeConfig | undefined,
  env: { VITE_SENTRY_DSN?: string; VITE_SENTRY_ENVIRONMENT?: string; VITE_SENTRY_RELEASE?: string; MODE?: string },
): ErrorReportingOptions | null {
  const dsn = parseDsn(runtime?.sentryDsn || env.VITE_SENTRY_DSN)
  if (!dsn) return null
  const release = (runtime?.release || env.VITE_SENTRY_RELEASE || '').trim()
  return {
    ...dsn,
    environment: (runtime?.environment || env.VITE_SENTRY_ENVIRONMENT || env.MODE || 'development').trim(),
    ...(release ? { release } : {}),
  }
}

/** 凭据脱敏（纯函数；规则与主服务 scrubMessage 一致） */
export function scrubMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[JWT REDACTED]')
    .replace(/(password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*("[^"]*"|'[^']*'|\S+)/gi, '$1=[REDACTED]')
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[REDACTED_HEX]')
}

/** URL 去查询串与片段（纯函数）：查询串里可能带 token/邀请码 */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/)
  return cut === -1 ? url : url.slice(0, cut)
}

// Chrome/Edge：`    at fn (url:1:2)` / `    at url:1:2`；Firefox/Safari：`fn@url:1:2`
const CHROME_FRAME_RE = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/
const GECKO_FRAME_RE = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/
const EXTENSION_RE = /^(?:chrome|moz|safari(?:-web)?)-extension:\/\//

/** 解析浏览器栈（纯函数）→ Sentry frames（最早调用在前；扩展程序帧标记 in_app:false） */
export function parseStackFrames(stack: string | undefined): StackFrame[] {
  if (!stack) return []
  const frames: StackFrame[] = []
  for (const line of stack.split('\n')) {
    const match = CHROME_FRAME_RE.exec(line) ?? GECKO_FRAME_RE.exec(line)
    if (!match) continue
    const [, fn, rawFile, rawLine, rawCol] = match
    if (!rawFile) continue
    const filename = stripQuery(rawFile)
    frames.push({
      filename,
      ...(fn ? { function: fn } : {}),
      lineno: Number(rawLine),
      colno: Number(rawCol),
      in_app: !EXTENSION_RE.test(filename) && !filename.includes('/node_modules/'),
    })
    if (frames.length >= MAX_FRAMES) break
  }
  return frames.reverse()
}

export interface CaptureContext {
  /** 捕获来源：window.error / unhandledrejection / react.boundary */
  mechanism: string
  componentStack?: string
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error
  if (typeof error === 'string') return new Error(error)
  return new Error('未知错误（非 Error 抛出）')
}

/** 构造 Sentry 事件体（纯函数；不含 Cookie/localStorage/请求体） */
export function buildEvent(
  error: unknown,
  ctx: CaptureContext,
  options: ErrorReportingOptions,
  page: { url: string; userAgent: string },
  now: Date = new Date(),
): Record<string, unknown> {
  const err = toError(error)
  const frames = parseStackFrames(err.stack)
  const value = scrubMessage(err.message || err.name || 'Error').slice(0, MAX_MESSAGE_LENGTH)
  return {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: now.getTime() / 1000,
    platform: 'javascript',
    level: 'error',
    logger: ctx.mechanism,
    environment: options.environment,
    ...(options.release ? { release: options.release } : {}),
    sdk: { name: SDK_NAME, version: SDK_VERSION },
    tags: { service: 'openschedule-web', mechanism: ctx.mechanism },
    request: { url: stripQuery(page.url), headers: { 'User-Agent': page.userAgent } },
    ...(ctx.componentStack
      ? { extra: { componentStack: scrubMessage(ctx.componentStack).slice(0, MAX_MESSAGE_LENGTH) } }
      : {}),
    exception: {
      values: [
        {
          type: err.name || 'Error',
          value,
          mechanism: { type: ctx.mechanism, handled: ctx.mechanism === 'react.boundary' },
          ...(frames.length > 0 ? { stacktrace: { frames } } : {}),
        },
      ],
    },
  }
}

/** 序列化 Envelope（纯函数） */
export function buildEnvelope(event: Record<string, unknown>, sentAt: Date = new Date()): string {
  const header = JSON.stringify({ event_id: event.event_id, sent_at: sentAt.toISOString() })
  return `${header}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`
}

/** 整条栈都来自浏览器扩展 → 不是本应用的错误 */
function isExtensionNoise(error: unknown): boolean {
  const frames = parseStackFrames(toError(error).stack)
  return frames.length > 0 && frames.every((f) => EXTENSION_RE.test(f.filename))
}

interface Transport {
  fetch: typeof fetch
  now: () => number
}

let active: { options: ErrorReportingOptions; transport: Transport } | null = null
let windowStart = 0
let windowCount = 0
const recent = new Map<string, number>()

/**
 * 初始化：无有效 DSN 返回 false 并保持 no-op。
 * @param transport 仅测试注入；生产用全局 fetch 与 Date.now
 */
export function initErrorReporting(
  options: ErrorReportingOptions | null,
  transport: Partial<Transport> = {},
): boolean {
  windowStart = 0
  windowCount = 0
  recent.clear()
  if (!options) {
    active = null
    return false
  }
  active = {
    options,
    transport: { fetch: transport.fetch ?? globalThis.fetch.bind(globalThis), now: transport.now ?? Date.now },
  }
  return true
}

export function isErrorReportingEnabled(): boolean {
  return active !== null
}

function allow(key: string, now: number): boolean {
  if (now - windowStart >= 60_000) {
    windowStart = now
    windowCount = 0
  }
  const last = recent.get(key)
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false
  if (windowCount >= MAX_EVENTS_PER_MINUTE) return false
  windowCount += 1
  recent.set(key, now)
  return true
}

/** 上报一次异常（fire-and-forget）：未启用/超限/重复/传输失败一律静默，绝不影响页面 */
export function captureException(error: unknown, ctx: CaptureContext): void {
  const state = active
  if (!state) return
  try {
    if (isExtensionNoise(error)) return
    const err = toError(error)
    if (!allow(`${err.name}:${err.message}`, state.transport.now())) return
    const event = buildEvent(error, ctx, state.options, {
      url: typeof location !== 'undefined' ? location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    })
    void state.transport
      .fetch(state.options.envelopeUrl, {
        method: 'POST',
        // text/plain = CORS 简单请求（无预检）；keepalive 保证页面卸载时仍能发出
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        body: buildEnvelope(event),
        keepalive: true,
        credentials: 'omit',
      })
      .then(
        () => undefined,
        () => undefined,
      )
  } catch {
    /* 观测失败不得影响业务 */
  }
}

/** 挂载全局监听（main.tsx 调用一次）；返回卸载函数（测试用） */
export function installGlobalHandlers(target: Window = window): () => void {
  const onError = (event: ErrorEvent) => {
    // 跨域脚本错误只有 "Script error." 且无栈，无定位价值
    if (!event.error && /^Script error\.?$/.test(event.message)) return
    captureException(event.error ?? event.message, { mechanism: 'window.error' })
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    captureException(event.reason, { mechanism: 'unhandledrejection' })
  }
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)
  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onRejection)
  }
}

/** 测试用：重置为 no-op */
export function resetErrorReportingForTest(): void {
  initErrorReporting(null)
}
