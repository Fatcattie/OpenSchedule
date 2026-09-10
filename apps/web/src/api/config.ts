/**
 * 职责：API 层统一配置 —— baseURL、mock 开关、token 存储 key
 */

/** REST 统一前缀（规格 3.5） */
export const API_BASE = '/api/v1'

/**
 * Mock 开关（默认开，保证后端未就绪时页面不白屏）：
 * - 本地开发：默认走 mock；后端就绪后启动时设 VITE_USE_MOCK=false（或置为 false 并删除 mock 分支）
 * - 真实模式：请求经 vite dev proxy 转发到 localhost:3000
 */
export const USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK !== 'false'

/** token 在 localStorage 的存储 key */
export const TOKEN_STORAGE_KEYS = {
  access: 'os.access_token',
  refresh: 'os.refresh_token',
} as const
