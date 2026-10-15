/**
 * 职责：`useCan()` 稳定性与角色响应性测试（ARCH §7 / M2-P0-01）。
 *
 * 补齐既有 `permission.test.ts` 的盲区：该文件只测纯函数 `can` / `PERMISSIONS`，
 * 未验证 hook 形态。本用例用 react-test-renderer 渲染一个读取 `useCan()` 的载体，
 * 断言：
 *  - 返回函数的行为随 `AppProvider.role` 即时变化（角色切换后入口即时刷新）；
 *  - 角色不变时返回**同一引用**（useCallback 依赖正确 → 可安全入依赖数组）。
 *
 * `useAppContext` 以可变 `mockRole` 隔离（避免拉起 AppProvider 的 AsyncStorage 引导）。
 */
import TestRenderer, { act } from 'react-test-renderer'

/** 可变的角色替身（jest 允许以 mock 前缀的变量被工厂引用） */
let mockRole: 'manager' | 'member' = 'member'

jest.mock('@/store/AppProvider', () => ({
  useAppContext: () => ({ role: mockRole }),
}))

import { useCan, type PermissionAction } from '@/utils/permission'

/** 每次渲染捕获的 can 函数引用（用于断言引用稳定性） */
const captured: Array<(action: PermissionAction) => boolean> = []

/** 测试载体：把 useCan() 结果暴露到模块级数组 */
function Harness({ tick }: { tick: number }): null {
  void tick
  captured.push(useCan())
  return null
}

const latest = (): ((action: PermissionAction) => boolean) => captured[captured.length - 1]

beforeEach(() => {
  captured.length = 0
  mockRole = 'member'
})

describe('useCan() —— 角色响应性（切换后入口即时刷新）', () => {
  it('member 下 task:create=false，切到 manager 后同一次挂载即变 true', async () => {
    let renderer!: TestRenderer.ReactTestRenderer
    await act(async () => {
      renderer = TestRenderer.create(<Harness tick={0} />)
    })
    expect(latest()('task:create')).toBe(false)
    expect(latest()('submission:create')).toBe(true)

    // 切换角色后强制重渲染（模拟 AppProvider.role 变化）
    mockRole = 'manager'
    await act(async () => {
      renderer.update(<Harness tick={1} />)
    })
    expect(latest()('task:create')).toBe(true)
    expect(latest()('submission:review')).toBe(true)

    await act(async () => {
      renderer.unmount()
    })
  })
})

describe('useCan() —— 引用稳定性（可安全入依赖数组）', () => {
  it('角色不变时多次渲染返回同一引用', async () => {
    let renderer!: TestRenderer.ReactTestRenderer
    await act(async () => {
      renderer = TestRenderer.create(<Harness tick={0} />)
    })
    const first = latest()

    await act(async () => {
      renderer.update(<Harness tick={1} />)
    })
    const second = latest()
    expect(second).toBe(first) // useCallback 依赖仅 role → 引用稳定

    await act(async () => {
      renderer.unmount()
    })
  })

  it('角色变化后返回新引用且行为更新', async () => {
    let renderer!: TestRenderer.ReactTestRenderer
    await act(async () => {
      renderer = TestRenderer.create(<Harness tick={0} />)
    })
    const before = latest()

    mockRole = 'manager'
    await act(async () => {
      renderer.update(<Harness tick={1} />)
    })
    const after = latest()
    expect(after).not.toBe(before)
    expect(before('task:create')).toBe(false)
    expect(after('task:create')).toBe(true)

    await act(async () => {
      renderer.unmount()
    })
  })
})
