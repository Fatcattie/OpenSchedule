/**
 * Mock 模块懒加载（§3.9 R7-5：mock 层仅在 USE_MOCK=true 时被打入独立 chunk；真实模式下浏览器不会下载该 chunk）
 *
 * 触发链路：每个 api/* 文件的 `if (USE_MOCK) return mockXxx(...)` 改为 `if (USE_MOCK) return (await getMockHandlers()).mockXxx(...)`，
 * 经 Vite/Rollup 的 dynamic import 切分后，mock handlers 单独成 chunk（约 90KB），默认配置下不会进入主入口。
 *
 * 位置说明（R8 mock→fixture 节点）：handlers/data 已移至 `src/__fixtures__/mock/`，与生产代码路径 `src/api/` 分离，
 * 本文件是 `src/api/` 内唯一的 mock 引用点（懒加载入口），保证 `src/api/**` 不再持有任何演示数据。
 *
 * 注意：USE_MOCK 由 `import.meta.env.VITE_USE_MOCK === 'true'` 决定（config.ts），默认值 false。
 * 真实模式调用入口函数时不会触发动态 import，浏览器根本不会请求 mock chunk。
 */
import type * as Handlers from '../../__fixtures__/mock/handlers'

export type MockHandlers = typeof Handlers

let handlersPromise: Promise<MockHandlers> | null = null

/**
 * 获取 mock handlers（懒加载；多次调用复用同一 Promise，避免重复触发 import）。
 * 仅由 `if (USE_MOCK)` 分支调用，确保 chunk 仅在 mock 模式下下载。
 */
export function getMockHandlers(): Promise<MockHandlers> {
  if (!handlersPromise) handlersPromise = import('../../__fixtures__/mock/handlers')
  return handlersPromise
}