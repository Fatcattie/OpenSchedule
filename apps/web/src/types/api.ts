/**
 * 职责：通用 API 类型 —— 响应信封 {data,meta}、错误信封 {code,message,details}（规格 3.1）、分页约定
 */
/** 统一响应信封（规格 3.1：响应体 {data, meta}） */
export interface ApiResponse<T> {
  data: T
  meta?: Record<string, unknown>
}

/** 错误信封（规格 3.1）：所有错误响应统一结构 */
export interface ApiErrorEnvelope {
  /** 业务错误码分段：400x 参数 / 401x 认证 / 403x 权限 / 404x 不存在 / 409x 冲突 / 429x 限流 */
  code: number
  message: string
  /** 明细（40902 非法状态迁移时必带 allowed_transitions，见规格 3.3） */
  details: unknown[]
  traceId?: string
  requestId?: string
}

/** 列表查询参数（规格 3.1：?page&page_size≤100；响应头 X-Total-Count 返回总数） */
export interface PageParams {
  page?: number
  pageSize?: number
}

/** 分页结果（前端统一形态：后端返回 data 数组 + X-Total-Count 头，组装为 items/total） */
export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
