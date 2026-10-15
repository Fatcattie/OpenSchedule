/**
 * Express 类型增强：为 Request 补充 id 字段（request-id.middleware.ts 写入，http-exception.filter.ts 读取）。
 * @types/express 5 未声明 Request.id，此处全局扩展。
 */
declare global {
  namespace Express {
    interface Request {
      /** 请求唯一标识（RequestIdMiddleware 设置，X-Request-Id 响应头同步） */
      id?: string;
    }
  }
}

export {};