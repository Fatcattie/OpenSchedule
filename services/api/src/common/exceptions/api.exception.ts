/**
 * ApiException：携带分段错误码的自定义异常（§3.1 错误信封 {code,message,details}）。
 * 业务代码推荐抛出本异常（或直接使用 Nest 内置异常 + {code,message} 对象响应体，异常过滤器两者都兼容）。
 */
import { HttpException, HttpStatus } from '@nestjs/common';
import { API_ERROR_CODES, CONFLICT_CODES } from '../constants/error-codes';

export interface ErrorDetails {
  /** 40902 状态迁移非法时必带：允许迁移枚举（前端据此渲染可用按钮，§3.3 补充规则） */
  allowed_transitions?: unknown[];
  [key: string]: unknown;
}

export class ApiException extends HttpException {
  constructor(
    code: number,
    message: string,
    status: number = HttpStatus.BAD_REQUEST,
    details: unknown = [],
  ) {
    super({ code, message, details }, status);
  }

  /** 40001 参数校验失败 */
  static badRequest(message: string, details: unknown = []): ApiException {
    return new ApiException(API_ERROR_CODES.VALIDATION, message, HttpStatus.BAD_REQUEST, details);
  }

  /** 40101 认证失败（access 过期时前端用 refresh 换新） */
  static unauthorized(message = '未认证或登录已过期'): ApiException {
    return new ApiException(API_ERROR_CODES.UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED);
  }

  /** 40301 权限不足（跨租户/跨项目默认此码） */
  static forbidden(message = '无权执行此操作'): ApiException {
    return new ApiException(API_ERROR_CODES.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }

  /** 40401 资源不存在或不可见（防存在性探测） */
  static notFound(message = '资源不存在或不可见'): ApiException {
    return new ApiException(API_ERROR_CODES.NOT_FOUND, message, HttpStatus.NOT_FOUND);
  }

  /** 40901 乐观锁冲突（version 不匹配，前端刷新重试） */
  static optimisticLock(message = '数据已被他人修改，请刷新后重试'): ApiException {
    return new ApiException(CONFLICT_CODES.OPTIMISTIC_LOCK, message, HttpStatus.CONFLICT);
  }

  /** 40902 状态迁移非法（details 必带 allowed_transitions） */
  static illegalTransition(from: string, to: string, allowedTransitions: unknown[]): ApiException {
    return new ApiException(
      CONFLICT_CODES.ILLEGAL_TRANSITION,
      `非法状态迁移: ${from} → ${to}`,
      HttpStatus.CONFLICT,
      { allowed_transitions: allowedTransitions },
    );
  }

  /** 42901 请求频率超限 */
  static rateLimited(message = '请求过于频繁，请稍后再试'): ApiException {
    return new ApiException(API_ERROR_CODES.RATE_LIMITED, message, HttpStatus.TOO_MANY_REQUESTS);
  }

  /** 502 AI 服务不可达 */
  static aiUnavailable(message = 'AI 服务暂不可用'): ApiException {
    return new ApiException(API_ERROR_CODES.AI_UNAVAILABLE, message, HttpStatus.BAD_GATEWAY);
  }

  /** 503 DB/Redis 不可用（触发降级路径） */
  static dependencyUnavailable(message = '依赖服务暂不可用'): ApiException {
    return new ApiException(API_ERROR_CODES.DEPENDENCY_UNAVAILABLE, message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
