/**
 * 职责：API 错误模型 —— 错误信封 {code,message,details}（规格 3.1）归一化为 ApiClientError，提供人话文案与错误码分支
 */
import axios from 'axios'
import type { ApiErrorEnvelope } from '@/types'

/** 统一错误类型：HTTP 状态码 + 业务错误码（规格 3.1 分段：400x/401x/403x/404x/409x/429x） */
export class ApiClientError extends Error {
  /** 业务错误码：40101 access 过期 / 40301 越权 / 40401 不存在 / 40901 乐观锁 / 40902 非法状态迁移 / 42901 限流 */
  code: number
  /** 错误信封 details（40902 时含 allowed_transitions，见规格 3.3） */
  details: unknown[]
  httpStatus?: number
  traceId?: string

  constructor(code: number, message: string, details: unknown[] = [], httpStatus?: number, traceId?: string) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.details = details
    this.httpStatus = httpStatus
    this.traceId = traceId
  }
}

/** HTTP 状态码兜底文案（后端未返回信封时使用） */
const HTTP_DEFAULT_MESSAGE: Record<number, string> = {
  400: '请求参数有误',
  401: '登录已过期，请重新登录',
  403: '没有权限执行该操作',
  404: '资源不存在或不可见',
  409: '状态冲突，请刷新后重试',
  429: '请求过于频繁，请稍后再试',
  500: '服务器内部错误',
  502: 'AI 服务暂不可用',
  503: '服务暂不可用，请稍后再试',
}

/** 把 axios 错误归一化为 ApiClientError；非网络错误原样返回 */
export function normalizeError(error: unknown): unknown {
  if (error instanceof ApiClientError) return error
  if (axios.isAxiosError(error)) {
    const envelope = error.response?.data as ApiErrorEnvelope | undefined
    const status = error.response?.status
    if (envelope && typeof envelope?.code === 'number') {
      return new ApiClientError(
        envelope.code,
        envelope.message || HTTP_DEFAULT_MESSAGE[status ?? 0] || '请求失败',
        envelope.details ?? [],
        status,
        envelope.traceId,
      )
    }
    return new ApiClientError(status ?? 0, error.message || HTTP_DEFAULT_MESSAGE[status ?? 0] || '网络异常', [], status)
  }
  return error
}

/** 页面通用取错误文案 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message ? `[${error.code}] ${error.message}` : `[${error.code}] 请求失败`
  }
  if (error instanceof Error) return error.message
  return String(error)
}

/** 从 40902 错误 details 中解析服务端允许的迁移（规格 3.3：details 必带 allowed_transitions 枚举） */
export function parseAllowedTransitions(error: unknown): string[] | null {
  if (!(error instanceof ApiClientError)) return null
  for (const item of error.details) {
    if (item && typeof item === 'object' && 'allowed_transitions' in item) {
      const list = (item as { allowed_transitions?: unknown }).allowed_transitions
      if (Array.isArray(list)) return list.map(String)
    }
  }
  return null
}
