/// <reference types="jest" />
/**
 * 职责：`useAsync` 缓存分支的**组件级**验证（增量 8 · T05 / A1）。
 *
 * 覆盖：成功落盘 / `code===0` 失败回退缓存（`isStale` + `updatedAt`）/ 4xx 不降级 /
 * 默认不传 `cache` 时行为不变 / `loading` 收窄（有数据时不闪骨架屏）/ scope 变化触发重取。
 *
 * 说明：以 `react-test-renderer` 渲染一个探针组件，把 `useAsync` 返回值快照到模块级变量后断言。
 */
import TestRenderer, { act } from 'react-test-renderer'
import { Text } from 'react-native'
import { useAsync, type UseAsyncResult } from '@/hooks/useAsync'
import * as cache from '@/services/cache'
import * as connectivity from '@/services/connectivity'
import { ApiError } from '@/types'

/** 探针快照 */
interface Snapshot {
  loading: boolean
  isStale: boolean
  updatedAt: number | null
  code: number | null
  hasData: boolean
  data: unknown
}

/** 最近一次渲染的 `useAsync` 返回值（供 refetch 调用） */
let api: UseAsyncResult<unknown> | null = null
/** 最近一次渲染的快照 */
let latest: Snapshot | null = null

/** 探针组件：渲染 `useAsync` 结果快照 */
function Probe({
  factory,
  cacheKey,
  marker = 0,
}: {
  factory: () => Promise<unknown>
  cacheKey?: string
  marker?: number
}): React.JSX.Element {
  const result = useAsync<unknown>(factory, [marker], cacheKey ? { cache: { key: cacheKey } } : undefined)
  api = result
  latest = {
    loading: result.loading,
    isStale: result.isStale,
    updatedAt: result.updatedAt,
    code: result.error instanceof ApiError ? result.error.code : result.error ? -1 : null,
    hasData: result.data !== null,
    data: result.data,
  }
  return <Text>{JSON.stringify(latest)}</Text>
}

/** 让挂起的微任务 / 定时器跑完 */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** 渲染探针并等待首轮取数 settle */
async function render(node: React.ReactElement): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(node)
  })
  await act(async () => {
    await flush()
  })
  return renderer
}

beforeEach(async () => {
  await cache.clearAllCache()
  cache.setCacheScope('user-001', 'manager')
  connectivity.resetConnectivity()
  api = null
  latest = null
})

describe('useAsync —— cache 开启：成功落盘', () => {
  it('取数成功后写入缓存，isStale=false', async () => {
    const factory = jest.fn(async () => ({ ok: 1 }))
    const renderer = await render(<Probe factory={factory} cacheKey="hook:success" />)

    expect(latest?.loading).toBe(false)
    expect(latest?.isStale).toBe(false)
    expect(latest?.hasData).toBe(true)
    const entry = await cache.readCache<{ ok: number }>(cache.buildCacheKey('hook:success'))
    expect(entry?.data).toEqual({ ok: 1 })

    await act(async () => {
      renderer.unmount()
    })
  })
})

describe('useAsync —— cache 开启：失败回退', () => {
  it('code===0（网络层）→ 回退缓存，isStale=true 且 error 对外为 null', async () => {
    await cache.writeCache(cache.buildCacheKey('hook:fallback'), { cached: true })
    const factory = jest.fn(async () => {
      throw new ApiError(0, '网络连接失败')
    })
    const renderer = await render(<Probe factory={factory} cacheKey="hook:fallback" />)

    expect(latest?.isStale).toBe(true)
    expect(latest?.updatedAt).not.toBeNull()
    expect(latest?.code).toBeNull() // 回退后 error 对外为 null ⇒ 屏幕走数据分支
    expect(latest?.hasData).toBe(true)
    expect(latest?.data).toEqual({ cached: true })

    await act(async () => {
      renderer.unmount()
    })
  })

  it('code>=500（服务端）→ 同样回退缓存', async () => {
    await cache.writeCache(cache.buildCacheKey('hook:5xx'), { cached: 'server' })
    const factory = jest.fn(async () => {
      throw new ApiError(500, '服务器内部错误')
    })
    const renderer = await render(<Probe factory={factory} cacheKey="hook:5xx" />)

    expect(latest?.isStale).toBe(true)
    expect(latest?.code).toBeNull()
    expect(latest?.data).toEqual({ cached: 'server' })

    await act(async () => {
      renderer.unmount()
    })
  })

  it('4xx 业务错误 → 不降级，走整屏错误（isStale=false）', async () => {
    await cache.writeCache(cache.buildCacheKey('hook:4xx'), { cached: true })
    const factory = jest.fn(async () => {
      throw new ApiError(40301, '没有权限')
    })
    const renderer = await render(<Probe factory={factory} cacheKey="hook:4xx" />)

    expect(latest?.isStale).toBe(false)
    expect(latest?.code).toBe(40301)
    expect(latest?.hasData).toBe(false)

    await act(async () => {
      renderer.unmount()
    })
  })
})

describe('useAsync —— 默认（不传 cache）行为不变', () => {
  it('失败时直接置 error，isStale 恒为 false', async () => {
    const factory = jest.fn(async () => {
      throw new ApiError(0, '网络连接失败')
    })
    const renderer = await render(<Probe factory={factory} />)

    expect(latest?.isStale).toBe(false)
    expect(latest?.code).toBe(0)
    expect(latest?.hasData).toBe(false)

    await act(async () => {
      renderer.unmount()
    })
  })
})

describe('useAsync —— loading 收窄', () => {
  it('已有数据时重新取数不置 loading（恢复刷新不闪骨架屏）', async () => {
    let resolveFn: ((value: unknown) => void) | null = null
    const factory = jest.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveFn = resolve
        }),
    )
    const renderer = await render(<Probe factory={factory} cacheKey="hook:loading" />)

    // 首轮挂起：loading=true
    expect(latest?.loading).toBe(true)
    expect(latest?.hasData).toBe(false)

    await act(async () => {
      resolveFn?.({ v: 1 })
    })
    expect(latest?.loading).toBe(false)
    expect(latest?.hasData).toBe(true)

    // 触发重取（新的挂起 Promise）：因已有数据，loading 保持 false
    await act(async () => {
      void api?.refetch()
    })
    expect(latest?.loading).toBe(false)

    await act(async () => {
      resolveFn?.({ v: 2 })
    })

    await act(async () => {
      renderer.unmount()
    })
  })
})

describe('useAsync —— scope 变化触发重取', () => {
  it('缓存 scope（userId:role）变化后 effect 重跑', async () => {
    const factory = jest.fn(async () => ({ v: 1 }))
    cache.setCacheScope('u1', 'member')
    const renderer = await render(<Probe factory={factory} cacheKey="hook:scope" marker={0} />)
    expect(factory).toHaveBeenCalledTimes(1)

    // 切换 scope 后以相同 props 重渲染：scope 参与 effect 依赖 ⇒ 自动重取
    cache.setCacheScope('u2', 'member')
    await act(async () => {
      renderer.update(<Probe factory={factory} cacheKey="hook:scope" marker={0} />)
    })
    await act(async () => {
      await flush()
    })
    expect(factory).toHaveBeenCalledTimes(2)

    await act(async () => {
      renderer.unmount()
    })
  })
})
