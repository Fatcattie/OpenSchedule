/// <reference types="jest" />
/**
 * 职责：离线缓存层 + 连通性单例的**纯逻辑**单元测试（增量 8 · T05）。
 *
 * 覆盖：
 * - `services/cache`：完整 key 拼接 / scope 隔离 / 读写往返 / 未命中 / 容量上限淘汰（条目数 + 体积）/ 清空；
 * - `services/connectivity`：状态机（在线 ↔ 离线）/ 原因 / 模拟离线 / 订阅 / 刷新注册表。
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as cache from '@/services/cache'
import * as connectivity from '@/services/connectivity'
import { CACHE_LIMITS } from '@/services/config'
import { simulateLatency } from '@/services/client'
import { ApiError } from '@/types'

beforeEach(async () => {
  await AsyncStorage.clear()
  cache.setCacheScope(null, 'manager') // 复位为 anon:manager
  connectivity.resetConnectivity()
})

describe('cache —— key 与 scope', () => {
  it('完整 key = os.cache.<userId>:<role>.<域内 key>', () => {
    cache.setCacheScope('u1', 'member')
    expect(cache.getCacheScope()).toBe('u1:member')
    expect(cache.buildCacheKey('projects:active')).toBe('os.cache.u1:member.projects:active')
  })

  it('未登录 scope 回落为 anon:<role>', () => {
    cache.setCacheScope(null, 'member')
    expect(cache.getCacheScope()).toBe('anon:member')
  })
})

describe('cache —— 读写往返与隔离', () => {
  it('写入后可读回，含 updatedAt', async () => {
    const key = cache.buildCacheKey('demo:one')
    await cache.writeCache(key, { value: 42 })
    const entry = await cache.readCache<{ value: number }>(key)
    expect(entry).not.toBeNull()
    expect(entry?.data).toEqual({ value: 42 })
    expect(typeof entry?.updatedAt).toBe('number')
  })

  it('未命中返回 null', async () => {
    const entry = await cache.readCache(cache.buildCacheKey('missing'))
    expect(entry).toBeNull()
  })

  it('scope 隔离：不同 scope 互不可见', async () => {
    cache.setCacheScope('u1', 'member')
    await cache.writeCache(cache.buildCacheKey('shared'), { from: 'u1' })
    cache.setCacheScope('u2', 'member')
    expect(await cache.readCache(cache.buildCacheKey('shared'))).toBeNull()
  })
})

describe('cache —— 容量上限与淘汰', () => {
  it('条目数超限时淘汰最旧（LRU 近似）', async () => {
    const keys = Array.from({ length: CACHE_LIMITS.maxEntries + 1 }, (_unused, index) =>
      cache.buildCacheKey(`item:${index}`),
    )
    for (let index = 0; index < keys.length; index += 1) {
      await cache.writeCache(keys[index], { index })
    }
    // 最旧的 0 号被淘汰，最新的仍在
    expect(await cache.readCache(keys[0])).toBeNull()
    expect(await cache.readCache(keys[keys.length - 1])).not.toBeNull()
  })

  it('总体积超限时淘汰最旧', async () => {
    const first = cache.buildCacheKey('big:first')
    const second = cache.buildCacheKey('big:second')
    // 两条各约 300KB，合计 > 512KB ⇒ 淘汰先写入的一条
    await cache.writeCache(first, 'a'.repeat(300 * 1024))
    await cache.writeCache(second, 'b'.repeat(300 * 1024))
    expect(await cache.readCache(first)).toBeNull()
    expect(await cache.readCache(second)).not.toBeNull()
  })
})

describe('cache —— clearAllCache', () => {
  it('清空全部缓存条目与索引（走索引逐键 removeItem）', async () => {
    const a = cache.buildCacheKey('a')
    const b = cache.buildCacheKey('b')
    await cache.writeCache(a, 1)
    await cache.writeCache(b, 2)
    await cache.clearAllCache()
    expect(await cache.readCache(a)).toBeNull()
    expect(await cache.readCache(b)).toBeNull()
  })
})

describe('connectivity —— 状态机', () => {
  it('默认在线', () => {
    expect(connectivity.getStatus()).toBe('online')
    expect(connectivity.isOffline()).toBe(false)
  })

  it('请求失败 → 离线（记录原因）；请求成功 → 恢复在线', () => {
    connectivity.notifyNetworkFailure('network')
    expect(connectivity.isOffline()).toBe(true)
    expect(connectivity.getReason()).toBe('network')

    connectivity.notifyNetworkFailure('server')
    expect(connectivity.getReason()).toBe('server')

    connectivity.notifyNetworkSuccess()
    expect(connectivity.isOffline()).toBe(false)
  })

  it('模拟离线开关：打开即离线，关闭不自动恢复', () => {
    connectivity.setSimulatedOffline(true)
    expect(connectivity.isSimulatedOffline()).toBe(true)
    expect(connectivity.isOffline()).toBe(true)

    connectivity.setSimulatedOffline(false)
    expect(connectivity.isSimulatedOffline()).toBe(false)
    // 关闭后需一次请求成功才恢复
    expect(connectivity.isOffline()).toBe(true)
    connectivity.notifyNetworkSuccess()
    expect(connectivity.isOffline()).toBe(false)
  })

  it('订阅：状态变化时回调，取消后不再回调', () => {
    const listener = jest.fn()
    const unsubscribe = connectivity.subscribeStatus(listener)
    connectivity.notifyNetworkFailure('network')
    expect(listener).toHaveBeenCalledWith('offline', 'network')
    unsubscribe()
    connectivity.notifyNetworkSuccess()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('刷新注册表：refetchAll 触发全部注册项，注销后不再触发', () => {
    const first = jest.fn()
    const second = jest.fn()
    const offFirst = connectivity.registerRefetcher(first)
    connectivity.registerRefetcher(second)
    connectivity.refetchAll()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)

    offFirst()
    connectivity.refetchAll()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
  })
})

describe('client —— simulateLatency 单点离线拦截（§2.2）', () => {
  it('模拟离线开启时抛 ApiError(0) 并上报离线；关闭后一次成功请求恢复在线', async () => {
    connectivity.setSimulatedOffline(true)
    await expect(simulateLatency()).rejects.toBeInstanceOf(ApiError)
    await expect(simulateLatency().catch((e) => e)).resolves.toMatchObject({ code: 0 })
    expect(connectivity.isOffline()).toBe(true)
    expect(connectivity.getReason()).toBe('network')

    // 关闭模拟离线后不自动恢复，需一次请求成功才转在线
    connectivity.setSimulatedOffline(false)
    expect(connectivity.isOffline()).toBe(true)
    await simulateLatency()
    expect(connectivity.isOffline()).toBe(false)
  })
})
