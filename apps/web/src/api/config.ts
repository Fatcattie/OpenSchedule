/**
 * 职责：API 层统一配置 —— baseURL、mock 开关、token 存储 key
 */

/** REST 统一前缀（规格 3.5） */
export const API_BASE = '/api/v1'

/**
 * Mock 开关（§3.9 R7：默认关，走真实 API；本地开发后端未就绪可临时置 VITE_USE_MOCK=true）。
 * - 默认（真实模式）：请求经 vite dev proxy 转发到 localhost:3000；mock 层保留为测试 fixture，不再运行时回退
 * - 本地开发（后端未就绪）：启动时设 VITE_USE_MOCK=true 走 mock
 */
export const USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK === 'true'

/**
 * 认证传输模式头（M-5）：声明 Cookie 模式后，服务端把 refresh token 写入 HttpOnly Cookie、响应体不再返回，
 * refresh/logout 也从该 Cookie 读取（见 services/api/src/modules/auth/refresh-cookie.ts）
 */
export const AUTH_TRANSPORT_HEADERS = { 'X-Auth-Transport': 'cookie' } as const

/**
 * localStorage key：真实模式不再存任何 token（只用于清理旧版本残留）；
 * 仅 mock 模式持久化假 access token
 */
export const TOKEN_STORAGE_KEYS = {
  access: 'os.access_token',
  refresh: 'os.refresh_token',
} as const
