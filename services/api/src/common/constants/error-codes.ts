/**
 * API 错误码分段表（§3.1）：400x 校验 / 401x 认证 / 403x 权限 / 404x 不存在 / 409x 冲突 / 429x 限流 / 502、503 依赖不可用。
 * 40901/40902 与任务状态机强相关，权威定义在 common/constants/task-status.ts（业务同事文件），本文件仅提供信封与映射工具，不重复定义。
 */
import { HttpStatus } from '@nestjs/common';
import { TASK_ERROR_CODES } from './task-status';

/** 通用错误码（任务域之外的权威码值；任务域 40901/40902 见 task-status.ts） */
export const API_ERROR_CODES = {
  /** 参数校验失败（字段缺失/格式错误/枚举越界） */
  VALIDATION: 40001,
  /** 认证失败（40101=access 过期，客户端用 refresh 换新） */
  UNAUTHORIZED: 40101,
  /** 权限不足（跨租户/跨项目访问默认 40301） */
  FORBIDDEN: 40301,
  /** 资源不存在或不可见（跨租户猜测资源 id 时按此处理，防存在性探测） */
  NOT_FOUND: 40401,
  /** 请求频率超限（登录/短信/开放 API 等） */
  RATE_LIMITED: 42901,
  /** AI 服务不可达 */
  AI_UNAVAILABLE: 502,
  /** DB/Redis 不可用（触发降级路径） */
  DEPENDENCY_UNAVAILABLE: 503,
  /** 未分类内部错误 */
  INTERNAL: 50000,
} as const;

/** 任务域冲突码（引用业务同事定义的权威值，见 task-status.ts） */
export const CONFLICT_CODES = {
  /** 乐观锁冲突：version 不匹配，前端据此刷新重试 */
  OPTIMISTIC_LOCK: TASK_ERROR_CODES.OPTIMISTIC_LOCK,
  /** 状态迁移非法：details 必带 allowed_transitions 枚举 */
  ILLEGAL_TRANSITION: TASK_ERROR_CODES.ILLEGAL_TRANSITION,
} as const;

/** 从 HTTP 状态码推导分段错误码（异常未显式携带 code 时用；502/503 原样透传） */
export function deriveCodeFromStatus(status: number): number {
  if (status === HttpStatus.INTERNAL_SERVER_ERROR) return API_ERROR_CODES.INTERNAL;
  if (status === HttpStatus.BAD_GATEWAY || status === HttpStatus.SERVICE_UNAVAILABLE) return status;
  return status * 100 + 1;
}
