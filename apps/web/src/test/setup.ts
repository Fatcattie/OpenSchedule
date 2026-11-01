/**
 * vitest 测试环境初始化（§3.7 R8-1）
 *
 * - jest-dom 匹配器：toBeInTheDocument / toHaveTextContent / toBeVisible 等
 * - matchMedia / ResizeObserver polyfill：jsdom 不提供，部分 antd 组件会用到
 * - globalThis.localStorage 在 beforeEach 内清空
 * - timers / DOM 在 afterEach 还原
 */
import '@testing-library/jest-dom/vitest'
import '@ant-design/v5-patch-for-react-19'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// 每个用例前自动清理 —— 防止上一个用例 DOM 残留影响下一个
beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

afterEach(() => {
  cleanup()
  // 还原可能由用例改写的 timers
  vi.useRealTimers()
})

// jsdom 不提供 matchMedia，antd Layout/Grid 等组件会引用；最小化 stub 即可
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {}, // 兼容旧 API
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// ResizeObserver stub（部分图表组件依赖）
if (typeof globalThis !== 'undefined' && !(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
  ;(globalThis as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
