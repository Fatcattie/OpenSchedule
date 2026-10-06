/// <reference types="jest" />
/**
 * 职责：离线态 UI 组件级验证（增量 8 · T05）。
 *
 * 覆盖：
 * - `OfflineBanner`：无网络 vs 服务不可用文案分叉 / 副文案 / 「重试」回调 / 在线不渲染；
 * - `RefreshToast`：「已刷新」轻提示可见 / 隐藏；
 * - `StaleBadge`：缓存标记 + 相对时间；
 * - `ProfileScreen`「模拟离线」开关：`USE_MOCK === true` 时可见、切换回调生效；关闭门禁时不渲染。
 *
 * 范式照抄 `project-list-fab.test.tsx`（react-test-renderer + act + jest.mock）。
 */
import TestRenderer, { act } from 'react-test-renderer'

/** 可控连通性上下文 */
type MockConnectivity = {
  isOffline: boolean
  reason: 'network' | 'server'
  retryNow: jest.Mock
  setSimulatedOffline: jest.Mock
}

let mockUseMock = true
let mockRole: 'manager' | 'member' = 'manager'
let mockConnectivity: MockConnectivity = {
  isOffline: false,
  reason: 'network',
  retryNow: jest.fn(),
  setSimulatedOffline: jest.fn(),
}

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
}))

jest.mock('@/store/ConnectivityProvider', () => ({
  useConnectivity: () => mockConnectivity,
}))

jest.mock('@/store/AppProvider', () => ({
  useAppContext: () => ({ role: mockRole }),
}))

jest.mock('@/hooks', () => ({
  useAuth: () => ({
    user: { id: 'user-001', timezone: 'Asia/Shanghai' },
    tenant: null,
    role: mockRole,
    roles: [],
    setRole: jest.fn(),
    signOutAsync: jest.fn(),
  }),
  useAsync: () => ({
    data: [],
    loading: false,
    error: null,
    isStale: false,
    updatedAt: null,
    refetch: async () => undefined,
    retry: async () => undefined,
    setData: () => undefined,
  }),
}))

jest.mock('@/services', () => ({
  get USE_MOCK() {
    return mockUseMock
  },
  focusService: {
    getNotificationPreferences: jest.fn(async () => []),
  },
}))

import { OfflineBanner } from '@/components/OfflineBanner'
import { RefreshToast } from '@/components/RefreshToast'
import { StaleBadge } from '@/components/StaleBadge'
import { ProfileScreen } from '@/screens/ProfileScreen'

/** 让 FadeIn 的入场定时器在测试环境内完成 */
const settle = (ms = 400): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 递归拼接渲染树中的全部文本 */
function collectText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join('')
  const obj = node as { children?: unknown; props?: { children?: unknown } }
  const kids = obj.children ?? obj.props?.children
  return kids == null ? '' : collectText(kids)
}

/** 渲染并 settle，返回渲染器 */
async function render(node: React.ReactElement): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(node)
  })
  await act(async () => {
    await settle()
  })
  return renderer
}

beforeEach(() => {
  mockUseMock = true
  mockRole = 'manager'
  mockConnectivity = {
    isOffline: false,
    reason: 'network',
    retryNow: jest.fn(),
    setSimulatedOffline: jest.fn(),
  }
})

describe('OfflineBanner', () => {
  it('无网络：主/副文案 + 「重试」触发 retryNow', async () => {
    mockConnectivity = { ...mockConnectivity, isOffline: true, reason: 'network' }
    const renderer = await render(<OfflineBanner />)
    const text = collectText(renderer.toJSON())
    expect(text).toContain('当前无网络连接')
    expect(text).toContain('正在显示上次缓存内容')
    expect(text).toContain('重试')

    const retry = renderer.root.findAll((node) => node.props?.accessibilityLabel === '重试')
    expect(retry.length).toBeGreaterThan(0)
    await act(async () => {
      retry[0].props.onPress()
    })
    expect(mockConnectivity.retryNow).toHaveBeenCalledTimes(1)

    await act(async () => {
      renderer.unmount()
    })
  })

  it('服务不可用：文案区分（reason=server）', async () => {
    mockConnectivity = { ...mockConnectivity, isOffline: true, reason: 'server' }
    const renderer = await render(<OfflineBanner />)
    const text = collectText(renderer.toJSON())
    expect(text).toContain('服务暂时不可用')
    expect(text).not.toContain('当前无网络连接')

    await act(async () => {
      renderer.unmount()
    })
  })

  it('在线：不渲染', async () => {
    mockConnectivity = { ...mockConnectivity, isOffline: false }
    const renderer = await render(<OfflineBanner />)
    expect(collectText(renderer.toJSON())).toBe('')

    await act(async () => {
      renderer.unmount()
    })
  })
})

describe('RefreshToast', () => {
  it('可见时展示「已刷新」文案', async () => {
    const renderer = await render(<RefreshToast visible message="网络已恢复，已刷新" />)
    expect(collectText(renderer.toJSON())).toContain('网络已恢复，已刷新')

    await act(async () => {
      renderer.unmount()
    })
  })

  it('不可见时不渲染', async () => {
    const renderer = await render(<RefreshToast visible={false} />)
    expect(collectText(renderer.toJSON())).toBe('')

    await act(async () => {
      renderer.unmount()
    })
  })
})

describe('StaleBadge', () => {
  it('展示「缓存」标记与相对更新时间', async () => {
    const updatedAt = Date.now() - 5 * 60_000
    const renderer = await render(<StaleBadge updatedAt={updatedAt} />)
    const text = collectText(renderer.toJSON())
    expect(text).toContain('缓存')
    expect(text).toContain('上次更新')
    expect(text).toContain('分钟前')

    await act(async () => {
      renderer.unmount()
    })
  })
})

describe('ProfileScreen —— 模拟离线开关（USE_MOCK 门禁）', () => {
  it('USE_MOCK=true：渲染「模拟离线」开关，切换回调生效', async () => {
    mockUseMock = true
    const renderer = await render(<ProfileScreen />)
    expect(collectText(renderer.toJSON())).toContain('模拟离线')

    const switches = renderer.root.findAll((node) => typeof node.props?.onValueChange === 'function')
    expect(switches.length).toBeGreaterThan(0)
    await act(async () => {
      switches[0].props.onValueChange(true)
    })
    expect(mockConnectivity.setSimulatedOffline).toHaveBeenCalledWith(true)

    await act(async () => {
      renderer.unmount()
    })
  })

  it('USE_MOCK=false：不渲染「模拟离线」开关', async () => {
    mockUseMock = false
    const renderer = await render(<ProfileScreen />)
    expect(collectText(renderer.toJSON())).not.toContain('模拟离线')

    await act(async () => {
      renderer.unmount()
    })
  })
})
