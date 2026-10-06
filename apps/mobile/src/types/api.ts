/**
 * 职责：统一响应包装与错误模型（对齐 Web 端约定，ARCH §4）。
 */

/** 后端统一响应信封 */
export interface ApiResponse<T> {
  /** 0 = 成功；非 0 为业务错误码 */
  code: number
  data: T
  message: string
}

/** 分页响应体 */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/**
 * 统一错误类型。
 * 关键错误码：40101 access 过期 / 40301 越权 / 40401 不存在 /
 * 40901 乐观锁冲突 / 40902 非法状态迁移 / 42901 限流。
 */
export class ApiError extends Error {
  code: number
  details?: unknown

  constructor(code: number, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
  }
}

/** 乐观锁冲突 */
export const ERR_OPTIMISTIC_LOCK = 40901
/** 非法状态迁移（details 带 allowed_transitions） */
export const ERR_ILLEGAL_TRANSITION = 40902

/** 从 40902 错误 details 中解析服务端允许的迁移枚举 */
export function parseAllowedTransitions(error: unknown): string[] | null {
  if (!(error instanceof ApiError)) return null
  const details = error.details
  if (details && typeof details === 'object' && 'allowed_transitions' in details) {
    const list = (details as { allowed_transitions?: unknown }).allowed_transitions
    if (Array.isArray(list)) return list.map(String)
  }
  return null
}

/** 取错误人话文案 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message || `请求失败（${error.code}）`
  if (error instanceof Error) return error.message
  return String(error)
}

/** 离线整屏错误态文案（增量 8 · Q10：无网络时 ErrorState 的准确文案） */
export const NETWORK_OFFLINE_MESSAGE = '当前无网络连接，请检查网络后重试'

/** 是否网络层失败（`ApiError.code === 0`，离线信号） */
export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 0
}

/**
 * 是否「可降级」错误（增量 8 · A2）：`code === 0`（网络层）或 `code >= 500`（服务端）。
 * 命中时可回退缓存；4xx 业务错误（越权 / 非法迁移 / 乐观锁）**不降级**，走整屏错误态。
 */
export function isDegradableError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  // 仅「网络层失败（code === 0）」或「HTTP 5xx（500–599）」可降级。
  // ⚠️ 本仓后端业务错误码为 **5 位数**（如 40301 越权 / 40901 乐观锁 / 40902 非法迁移），
  // 数值上天然 >= 500；若仅用 `code >= 500` 会把它们误判为可降级，与 A2 的目标
  // 「避免 403 / 40902 也显示陈旧数据」相悖。故上界收敛到 599（HTTP 5xx 区间）。
  return error.code === 0 || (error.code >= 500 && error.code < 600)
}
