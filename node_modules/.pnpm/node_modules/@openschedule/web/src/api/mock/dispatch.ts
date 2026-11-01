/**
 * Mock 分发（R8：`USE_MOCK` 双分支彻底收敛的唯一判定点）
 *
 * 收敛前：每个 `src/api/*.ts` 的每个函数都写 `if (USE_MOCK) { const { mockX } = await getMockHandlers(); return mockX(...) }`，
 * 全仓 ~87 处分支、167 处 `USE_MOCK` 引用，逻辑散落且 mock 处理器名不受类型约束。
 *
 * 收敛后：api 模块只写真实路径，mock 由本文件唯一判定：
 *   `return mockOr('mockGetTask', () => client.get(...).then(r => r.data.data), id)`
 * - `USE_MOCK=false`（默认）：只执行真实请求，mock chunk 永不下载（懒加载保持在 loader.ts）；
 * - `USE_MOCK=true`（本地后端未就绪）：走同名 mock 处理器；
 * - 处理器名受 `keyof MockHandlers` 约束 → 拼写错误 / 处理器删除在 typecheck 阶段暴露。
 *
 * 约束（由 `tests/qa/web-mock-convergence.test.ts` 门禁保证）：`src/api/**` 除本目录与 `config.ts` 外
 * 不得再出现 `USE_MOCK`。
 */
import { USE_MOCK } from '../config'
import { getMockHandlers } from './loader'
import type { MockHandlers } from './loader'

/** 可用的 mock 处理器名（取自 fixtures，保证与实现同步） */
export type MockHandlerName = {
  [K in keyof MockHandlers]: MockHandlers[K] extends (...args: never[]) => unknown ? K : never
}[keyof MockHandlers]

/**
 * 真实路径 + 可选 mock：`USE_MOCK=true` 时改走 `handler`（参数与真实路径调用处保持一致）。
 *
 * @param handler fixtures 中的 mock 处理器名
 * @param real 真实请求（仅在非 mock 模式执行，未执行时不会产生任何网络请求）
 * @param args 传给 mock 处理器的参数（与收敛前的 `mockXxx(...)` 调用逐一对齐）
 */
export async function mockOr<T>(
  handler: MockHandlerName,
  real: () => Promise<T>,
  ...args: unknown[]
): Promise<T> {
  if (!USE_MOCK) return real()
  const handlers = await getMockHandlers()
  const fn = handlers[handler] as unknown as (...a: unknown[]) => Promise<T>
  return fn(...args)
}

/**
 * 本地字面量分支收敛（如 `if (USE_MOCK) return { id, deleted: true }`）：
 * 无对应 mock 处理器、仅返回固定结构时使用。
 */
export function mockOrValue<T>(real: () => Promise<T>, local: () => T): Promise<T> {
  if (!USE_MOCK) return real()
  return Promise.resolve(local())
}

/**
 * mock 结果需本地二次加工时使用（如 `{ ...mockGetDashboard(projectId), projectId }`）：
 * `USE_MOCK=true` → `map(await handler(...args))`，否则执行 `real`。
 */
export async function mockOrMap<R>(
  handler: MockHandlerName,
  map: (raw: unknown) => R,
  real: () => Promise<R>,
  ...args: unknown[]
): Promise<R> {
  if (!USE_MOCK) return real()
  const handlers = await getMockHandlers()
  const fn = handlers[handler] as unknown as (...a: unknown[]) => unknown
  return map(await fn(...args))
}

/**
 * 无返回值的副作用函数收敛（如 `exportCsv` 的浏览器下载）：
 * `USE_MOCK=true` → `local()`，否则 `real()`。
 */
export function mockOrVoid(real: () => void, local: () => void): void {
  if (USE_MOCK) local()
  else real()
}
