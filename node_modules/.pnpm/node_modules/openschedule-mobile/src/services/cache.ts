/**
 * 职责：缓存层（增量 8 · Q3 / Q4）—— 复用既有 `@react-native-async-storage/async-storage`（零新增依赖）。
 *
 * 关键约定：
 * - **完整 key** = `os.cache.<scope>.<域内 key>`，`scope = <userId>:<role>`（默认 `anon:manager`）；
 * - **索引式管理**：单独维护一份索引（条目 key / 最近写入时间 / 体积），据此做容量上限 + LRU 近似淘汰；
 * - **`clearAllCache()` 走索引逐键 `removeItem`**，**不依赖 `getAllKeys`**（测试替身未实现，见 ARCH §9-M5）；
 * - 所有存储操作 try/catch 静默降级（缓存不可用不得阻断主流程，对齐 AppProvider / useTimer 姿势）。
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { CACHE_KEYS, CACHE_LIMITS } from './config'

/** 单条缓存条目 */
export interface CacheEntry<T> {
  /** 缓存的数据本体 */
  data: T
  /** 写入时刻（epoch ms） */
  updatedAt: number
}

/** 索引条目（用于容量管理 / 淘汰 / 清空） */
interface CacheIndexEntry {
  /** 完整缓存 key */
  key: string
  /** 最近写入时刻（epoch ms） */
  updatedAt: number
  /** 序列化后体积（字符数近似字节） */
  size: number
}

/** 默认 scope（未登录 / 未知用户） */
const DEFAULT_SCOPE = 'anon:manager'

/** 当前缓存 scope = `${userId}:${role}` */
let currentScope = DEFAULT_SCOPE

/** 读取当前缓存 scope */
export function getCacheScope(): string {
  return currentScope
}

/** 设置缓存 scope（登录 / 角色切换时由 AppProvider 注入） */
export function setCacheScope(userId: string | null, role: string): void {
  currentScope = `${userId ?? 'anon'}:${role}`
}

/** 由「域内 key」拼出完整缓存 key（含 `os.cache.` 前缀与 scope） */
export function buildCacheKey(key: string): string {
  return `${CACHE_KEYS.prefix}${currentScope}.${key}`
}

/** 读取索引（异常 / 非法时回退空数组） */
async function readIndex(): Promise<CacheIndexEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.index)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is CacheIndexEntry =>
        !!entry &&
        typeof (entry as CacheIndexEntry).key === 'string' &&
        typeof (entry as CacheIndexEntry).updatedAt === 'number' &&
        typeof (entry as CacheIndexEntry).size === 'number',
    )
  } catch {
    return []
  }
}

/** 写入索引（失败静默） */
async function writeIndex(index: CacheIndexEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.index, JSON.stringify(index))
  } catch {
    // 忽略：索引写入失败不影响读取（下次写入重建）
  }
}

/** 读取缓存（未命中 / 解析失败返回 null） */
export async function readCache<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CacheEntry<T>> | null
    if (!parsed || typeof parsed.updatedAt !== 'number') return null
    return { data: parsed.data as T, updatedAt: parsed.updatedAt }
  } catch {
    return null
  }
}

/**
 * 写入缓存并维护索引 / 淘汰。
 * 淘汰策略（A4）：条目上限 `CACHE_LIMITS.maxEntries`、总体积上限 `CACHE_LIMITS.maxBytes`，
 * 超限按「最近写入时间」从旧到新淘汰（LRU 近似）。
 */
export async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    const updatedAt = Date.now()
    const serialized = JSON.stringify({ data, updatedAt } satisfies CacheEntry<T>)
    await AsyncStorage.setItem(key, serialized)

    const size = serialized.length
    let index = (await readIndex()).filter((entry) => entry.key !== key)
    index.push({ key, updatedAt, size })
    // 最近写入时间升序（最旧在前），便于从头淘汰
    index.sort((a, b) => a.updatedAt - b.updatedAt)

    // ① 条目数上限
    while (index.length > CACHE_LIMITS.maxEntries) {
      const evicted = index.shift()
      if (evicted) await AsyncStorage.removeItem(evicted.key)
    }

    // ② 总体积上限
    let totalBytes = index.reduce((sum, entry) => sum + entry.size, 0)
    while (totalBytes > CACHE_LIMITS.maxBytes && index.length > 0) {
      const evicted = index.shift()
      if (evicted) {
        totalBytes -= evicted.size
        await AsyncStorage.removeItem(evicted.key)
      }
    }

    await writeIndex(index)
  } catch {
    // 忽略：缓存写入失败静默降级
  }
}

/** 清空全部缓存（走索引逐键 `removeItem`，不依赖 `getAllKeys`） */
export async function clearAllCache(): Promise<void> {
  try {
    const index = await readIndex()
    await Promise.all(index.map((entry) => AsyncStorage.removeItem(entry.key)))
    await AsyncStorage.removeItem(CACHE_KEYS.index)
  } catch {
    // 忽略：清空失败不影响使用（下次写入重建索引）
  }
}
