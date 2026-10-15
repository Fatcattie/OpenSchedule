/**
 * 职责：fetch 封装 —— 统一解包 ApiResponse、归一化错误为 ApiError、
 * 注入 Bearer token、401 回调（刷新位）、mock 延迟模拟（对齐 Web 端 client.ts 风格）。
 */
import { ApiError } from '@/types'
import { translate, type TranslationKey } from '@/i18n'
import { getCurrentLocale } from '@/i18n/current'
import { API_BASE, MOCK_LATENCY } from './config'
import { isSimulatedOffline, notifyNetworkFailure, notifyNetworkSuccess } from './connectivity'

/** 请求方法 */
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

/** 查询参数值 */
export type QueryValue = string | number | boolean | undefined | null

/** 统一请求入参 */
export interface RequestOptions {
  method?: HttpMethod
  body?: unknown
  query?: Record<string, QueryValue>
  signal?: AbortSignal
  /** 跳过 token 注入（登录 / 刷新等端点） */
  skipAuth?: boolean
}

/**
 * HTTP 状态码 → 服务层字典键（`http.*`，zh 值 = 改造前 `HTTP_DEFAULT_MESSAGE` 的 9 条兜底文案）。
 *
 * 原 `HTTP_DEFAULT_MESSAGE` 常量已改为**键映射**：取词统一走 `translate(getCurrentLocale(), key)`
 * ⇒ 语言切换即时生效。zh 输出与改造前**逐字节一致**（`getCurrentLocale()` 默认 `'zh-CN'`）。
 */
const HTTP_STATUS_KEY: Record<number, TranslationKey> = {
  400: 'http.400',
  401: 'http.401',
  403: 'http.403',
  404: 'http.404',
  409: 'http.409',
  429: 'http.429',
  500: 'http.500',
  502: 'http.502',
  503: 'http.503',
}

/** 取 HTTP 状态码兜底文案（未命中具体状态码时回落通用兜底） */
function httpDefaultMessage(status: number): string {
  const key = HTTP_STATUS_KEY[status]
  return translate(getCurrentLocale(), key ?? 'http.default')
}

/** access token 提供者（由 AppProvider 注入，避免 client 反向依赖 store） */
let tokenProvider: () => string | null = () => null

/** 401 处理回调（由 AppProvider 注入：清空会话并回到登录页） */
let unauthorizedHandler: (() => void) | null = null

/** 注入 token 提供者 */
export function setTokenProvider(provider: () => string | null): void {
  tokenProvider = provider
}

/** 注入 401 处理回调 */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

/** 把查询参数拼成 query string（跳过 undefined / null） */
function buildQueryString(query?: Record<string, QueryValue>): string {
  if (!query) return ''
  const pairs: string[] = []
  Object.keys(query).forEach((key) => {
    const value = query[key]
    if (value === undefined || value === null || value === '') return
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  })
  return pairs.length > 0 ? `?${pairs.join('&')}` : ''
}

/** mock 延迟：模拟真实网络抖动 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * 随机 mock 延迟（用于读接口，让骨架屏可见）。
 *
 * 增量 8 · 单点离线拦截：本函数被全仓 mock 调用点以 `if (USE_MOCK) { await simulateLatency(); ... }`
 * 形式**首先 await**，故在**此处**判断「模拟离线」即可一处生效、全局模拟断网（读 + 写全覆盖），
 * 且**60 处调用点零改动**。正常 mock 分支上报在线（`notifyNetworkSuccess()`）。
 */
export function simulateLatency(): Promise<void> {
  if (isSimulatedOffline()) {
    notifyNetworkFailure('network')
    return Promise.reject(new ApiError(0, translate(getCurrentLocale(), 'network.failed')))
  }
  notifyNetworkSuccess()
  const span = MOCK_LATENCY.max - MOCK_LATENCY.min
  return delay(MOCK_LATENCY.min + Math.floor(Math.random() * span))
}

/** 后端响应信封的宽松形态（解析后逐字段校验） */
interface ResponseEnvelope<T> {
  code?: number
  data?: T
  message?: string
  details?: unknown
}

/**
 * 响应解包 + 错误归一化（增量 11：由 `request` **原样抽出**，供 `request` 与 `postMultipart` 共用）。
 *
 * 口径与抽出前逐字一致：读 text → JSON.parse → 401 回调 → `!ok` 抛 ApiError（5xx 上报 server）
 * → 业务码校验 → 上报在线 → 返回 `envelope.data`。**不改变 `request` 的任何可观测行为。**
 */
async function parseEnvelope<T>(response: Response): Promise<T> {
  const rawText = await response.text()
  let envelope: ResponseEnvelope<T> | null = null
  if (rawText) {
    try {
      envelope = JSON.parse(rawText) as ResponseEnvelope<T>
    } catch {
      envelope = null
    }
  }

  if (response.status === 401 || envelope?.code === 40101) {
    unauthorizedHandler?.()
  }

  if (!response.ok) {
    const code = typeof envelope?.code === 'number' ? envelope.code : response.status
    const message = envelope?.message || httpDefaultMessage(response.status)
    // 服务端异常（5xx）→ 上报 server；4xx 业务错误不上报（非网络问题，见 A2）
    if (response.status >= 500) notifyNetworkFailure('server')
    throw new ApiError(code, message, envelope?.details)
  }

  // 业务错误：HTTP 200 但 code != 0（不上报，非网络问题）
  if (envelope && typeof envelope.code === 'number' && envelope.code !== 0) {
    throw new ApiError(
      envelope.code,
      envelope.message || translate(getCurrentLocale(), 'http.businessFailed'),
      envelope.details,
    )
  }

  // 请求成功 → 上报在线（恢复判据）
  notifyNetworkSuccess()
  return (envelope?.data ?? (undefined as unknown as T)) as T
}

/**
 * 统一请求入口。
 * 真实模式下：注入 token → fetch → 解包 ApiResponse → 错误归一化为 ApiError。
 * 注意：mock 分支不经过本函数（各 service 首行 `if (USE_MOCK)` 短路）。
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal, skipAuth = false } = options
  const url = `${API_BASE}${path}${buildQueryString(query)}`

  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (!skipAuth) {
    const token = tokenProvider()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    // 网络层异常（断网 / DNS 失败）
    throw new ApiError(0, translate(getCurrentLocale(), 'network.failed'), error)
  }

  return parseEnvelope<T>(response)
}

/**
 * multipart/form-data 上传（增量 11 · 附件上传专用）。
 * 真实模式下：注入 token → fetch(FormData) → 与 `request` 同口径解包 / 错误归一化。
 *
 * 🔴 **绝不手动设置 `Content-Type`** —— 手动写 `multipart/form-data` 会**丢掉 boundary**，
 * 服务端 multer 无法解析。boundary 必须由运行时自动附加。**这是本增量最易踩的坑。**
 */
export async function postMultipart<T>(
  path: string,
  form: FormData,
  options: Omit<RequestOptions, 'method' | 'body'> = {},
): Promise<T> {
  const { query, signal, skipAuth = false } = options
  const url = `${API_BASE}${path}${buildQueryString(query)}`

  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (!skipAuth) {
    const token = tokenProvider()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: form,
      signal,
    })
  } catch (error) {
    // 网络层异常（断网 / DNS 失败）
    throw new ApiError(0, translate(getCurrentLocale(), 'network.failed'), error)
  }

  return parseEnvelope<T>(response)
}

/** 便捷方法（真实模式调用位使用） */
export const httpClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> =>
    request<T>(path, { ...options, method: 'DELETE' }),
}
