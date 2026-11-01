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

/** token 在 localStorage 的存储 key */
export const TOKEN_STORAGE_KEYS = {
  access: 'os.access_token',
  refresh: 'os.refresh_token',
} as const
