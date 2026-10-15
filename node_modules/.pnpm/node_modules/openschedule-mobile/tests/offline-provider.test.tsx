/// <reference types="jest" />
/**
 * 职责：`ConnectivityProvider` 的**直接单元测试**（增量 8 · QA 闭环 R2）。
 *
 * 覆盖三条恢复编排机制（ARCH §2.4 / §2.6），每条均可被定向变异打红：
 * ① 退避探测时序 **5s → 10s → 30s 封顶**，转在线即停止并复位；
 * ② `AppState` 回前台（`background`/`inactive` → `active`）**立即**触发一次刷新；
 * ③ 1s **尾沿节流合并**：窗口内多次刷新信号只产生一次 `refetchAll`；单次恢复只出一个「已刷新」提示。
 *
 * 观测手段：注册一个真实 `refetcher`（`connectivity.registerRefetcher`）作为 `refetchAll` 的落地计数，
 * 避免对 `refetchAll` 做模块级 spy（ESM 命名空间 spy 不可靠）。
 */
import TestRenderer, { act } from 'react-test-renderer'
import { AppState, type AppStateStatus } from 'react-native'
import {
  ConnectivityProvider,
  useConnectivity,
  type ConnectivityContextValue,
} from '@/store/ConnectivityProvider'
import { RefreshToast } from '@/components/RefreshToast'
import * as connectivity from '@/services/connectivity'

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }))

/** 最近一次渲染的连通性上下文 */
let ctx: ConnectivityContextValue | null = null
/** 当前测试的渲染器（供 afterEach 卸载） */
let renderer: TestRenderer.ReactTestRenderer | null = null
/** `AppState.addEventListener` 的 spy（用于取回 change 回调） */
let appStateSpy: jest.SpyInstance

/** 探针：捕获上下文取值 */
function Probe(): null {
  ctx = useConnectivity()
  return null
}

/** 挂载 Provider + 探针 */
function mount(): TestRenderer.ReactTestRenderer {
  act(() => {
    renderer = TestRenderer.create(
      <ConnectivityProvider>
        <Probe />
      </ConnectivityProvider>,
    )
  })
  return renderer as TestRenderer.ReactTestRenderer
}

beforeEach(() => {
  jest.useFakeTimers()
  connectivity.resetConnectivity()
  ctx = null
  renderer = null
  appStateSpy = jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() })
  // `jest.spyOn` 对已 mock 的方法会复用同一实例 ⇒ 显式清空调用记录，避免跨用例累积
  appStateSpy.mockClear()
})

afterEach(() => {
  if (renderer) {
    const current = renderer
    act(() => {
      current.unmount()
    })
  }
  connectivity.resetConnectivity()
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('ConnectivityProvider —— 退避探测时序（5s → 10s → 30s 封顶）', () => {
  it('离线后探测在 5/10/30/30s 触发刷新；转在线即停止并复位', () => {
    const recorded: number[] = []
    let now = 0
    const refetch = jest.fn(() => recorded.push(now))
    connectivity.registerRefetcher(refetch)
    mount()

    /** 推进 ms 毫秒（同时维护虚拟时钟） */
    const at = (ms: number): void => {
      now += ms
      act(() => {
        jest.advanceTimersByTime(ms)
      })
    }
    const count = (): number => refetch.mock.calls.length

    // 进入离线 → 首次探测计时 5000ms 启动
    act(() => {
      connectivity.notifyNetworkFailure('network')
    })
    expect(connectivity.isOffline()).toBe(true)

    // 探测 tick 发生在 5000ms，但刷新经 1s 尾沿节流 → 6000ms 落地
    at(5000)
    expect(count()).toBe(0)
    at(1000)
    expect(count()).toBe(1)

    // 第二次探测 +10s → tick 15000 → 刷新 16000
    at(9000)
    expect(count()).toBe(1)
    at(1000)
    expect(count()).toBe(2)

    // 第三次探测 +30s → tick 45000 → 刷新 46000
    at(29000)
    expect(count()).toBe(2)
    at(1000)
    expect(count()).toBe(3)

    // 第四次探测 +30s（封顶）→ tick 75000 → 刷新 76000
    at(29000)
    expect(count()).toBe(3)
    at(1000)
    expect(count()).toBe(4)

    // 断言实际刷新时间点序列：间隔 10s / 30s / 30s（对应探测 5/10/30/30 封顶）
    expect(recorded).toEqual([6000, 16000, 46000, 76000])
  })

  it('转在线后停止探测；再次离线时退避复位到初始 5s', () => {
    const refetch = jest.fn()
    connectivity.registerRefetcher(refetch)
    mount()

    const advance = (ms: number): void => {
      act(() => {
        jest.advanceTimersByTime(ms)
      })
    }
    const count = (): number => refetch.mock.calls.length

    act(() => {
      connectivity.notifyNetworkFailure('network')
    })
    // 首轮探测 5000ms + 节流 1000ms
    advance(6000)
    expect(count()).toBe(1)

    // 转在线 → 恢复刷新（尾沿 +1000ms），随后探测停止
    act(() => {
      connectivity.notifyNetworkSuccess()
    })
    advance(1000)
    const baseline = count()
    advance(40000) // 超过 30s 封顶间隔
    expect(count()).toBe(baseline)

    // 再次离线 → 退避复位到初始 5s（首个刷新仍在 5s + 1s 处）
    act(() => {
      connectivity.notifyNetworkFailure('network')
    })
    advance(5000)
    expect(count()).toBe(baseline)
    advance(1000)
    expect(count()).toBe(baseline + 1)
  })
})

describe('ConnectivityProvider —— AppState 回前台', () => {
  it('离线时 background/inactive → active 立即触发一次刷新（不等退避）', () => {
    const refetch = jest.fn()
    connectivity.registerRefetcher(refetch)
    mount()

    act(() => {
      connectivity.notifyNetworkFailure('network')
    })

    const changeCall = appStateSpy.mock.calls.find(([type]) => type === 'change')
    expect(changeCall).toBeDefined()
    const handler = changeCall?.[1] as ((status: AppStateStatus) => void) | undefined
    expect(typeof handler).toBe('function')

    // 回前台（active）→ 走 1s 节流（尾沿），不等 5s 退避探测
    act(() => {
      handler?.('active')
    })
    expect(refetch).toHaveBeenCalledTimes(0)
    act(() => {
      jest.advanceTimersByTime(1000)
    })
    expect(refetch).toHaveBeenCalledTimes(1)

    // 在线时回前台不触发刷新
    act(() => {
      connectivity.notifyNetworkSuccess()
    })
    act(() => {
      jest.advanceTimersByTime(1000) // 消化恢复触发的刷新
    })
    const baseline = refetch.mock.calls.length
    act(() => {
      handler?.('active')
    })
    act(() => {
      jest.advanceTimersByTime(1000)
    })
    expect(refetch.mock.calls.length).toBe(baseline)
  })
})

describe('ConnectivityProvider —— 1s 尾沿节流合并', () => {
  it('1s 内多次刷新信号只产生一次 refetchAll（尾沿触发）', () => {
    const refetch = jest.fn()
    connectivity.registerRefetcher(refetch)
    mount()

    act(() => {
      ctx?.retryNow()
      ctx?.retryNow()
      ctx?.retryNow()
    })
    // 未立即刷新（尾沿）
    expect(refetch).toHaveBeenCalledTimes(0)
    act(() => {
      jest.advanceTimersByTime(999)
    })
    expect(refetch).toHaveBeenCalledTimes(0)
    act(() => {
      jest.advanceTimersByTime(1)
    })
    // 窗口结束只刷新一次
    expect(refetch).toHaveBeenCalledTimes(1)
    act(() => {
      jest.advanceTimersByTime(5000)
    })
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('单次恢复只产生一个「已刷新」提示（offline → online）', () => {
    mount()

    act(() => {
      connectivity.notifyNetworkFailure('network')
    })
    act(() => {
      connectivity.notifyNetworkSuccess()
    })

    const toasts = renderer!.root.findAllByType(RefreshToast)
    expect(toasts).toHaveLength(1)
    expect(toasts[0].props.visible).toBe(true)
    expect(toasts[0].props.message).toBe('网络已恢复，已刷新')

    // 重复「恢复」信号（已在线，状态无变化）不产生额外提示
    act(() => {
      connectivity.notifyNetworkSuccess()
      connectivity.notifyNetworkSuccess()
    })
    expect(renderer!.root.findAllByType(RefreshToast)).toHaveLength(1)
  })
})
