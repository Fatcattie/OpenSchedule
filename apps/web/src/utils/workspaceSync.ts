/**
 * 职责：工作台存储（D-07 一期）的纯编解码与差量计算 —— 前端视图值 ⇄ 后端 workspace_items 条目
 *
 * 编码规则：
 * - 「带唯一字符串 id 的对象数组」按条目拆存：每个元素一条（键 = id），另存 `__order__`（id 顺序）。
 *   这样改一条任务只上传这一条，而不是整份列表；
 * - 其余值（对象、字符串数组、无 id 的数组）整体存为一条 `__value__`。
 * 比较一律用键排序后的 JSON（后端 JSONB 会重排对象键，直接 JSON.stringify 会误判全量变化）。
 */

export const ORDER_KEY = '__order__'
export const VALUE_KEY = '__value__'

/** 条目键 → 条目 data */
export type EntryMap = Record<string, unknown>

export interface SyncOps {
  upserts: { key: string; data: unknown }[]
  deletes: string[]
}

/** 键排序的稳定 JSON（undefined 字段与 JSON.stringify 一样被丢弃） */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k]
          return acc
        }, {})
    }
    return v
  }) ?? 'null'
}

function itemIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const ids: string[] = []
  for (const el of value) {
    if (!el || typeof el !== 'object' || Array.isArray(el)) return null
    const id = (el as { id?: unknown }).id
    if (typeof id !== 'string' || id.length === 0 || id.length > 200 || id.startsWith('__')) return null
    ids.push(id)
  }
  return new Set(ids).size === ids.length ? ids : null
}

/** 视图值 → 条目表 */
export function encodeValue(value: unknown): EntryMap {
  const ids = itemIds(value)
  if (!ids) return { [VALUE_KEY]: value }
  const out: EntryMap = { [ORDER_KEY]: ids }
  ;(value as unknown[]).forEach((el, i) => {
    out[ids[i]] = el
  })
  return out
}

/** 条目表 → 视图值；集合从未写过（无任何条目）时返回 fallback */
export function decodeEntries<T>(entries: EntryMap, fallback: T): T {
  if (VALUE_KEY in entries) return entries[VALUE_KEY] as T
  const keys = Object.keys(entries)
  if (keys.length === 0) return fallback
  const order = Array.isArray(entries[ORDER_KEY]) ? (entries[ORDER_KEY] as string[]) : []
  const seen = new Set<string>()
  const out: unknown[] = []
  for (const id of order) {
    if (id in entries && id !== ORDER_KEY && !seen.has(id)) {
      out.push(entries[id])
      seen.add(id)
    }
  }
  // 顺序表缺失的条目（并发写入时可能出现）按库中顺序追加，不丢数据
  for (const k of keys) {
    if (k !== ORDER_KEY && !seen.has(k)) out.push(entries[k])
  }
  return out as T
}

/** 当前条目表 → 目标条目表 的最小写入集合 */
export function diffEntries(current: EntryMap, next: EntryMap): SyncOps {
  const upserts: SyncOps['upserts'] = []
  for (const [key, data] of Object.entries(next)) {
    if (!(key in current) || stableStringify(current[key]) !== stableStringify(data)) upserts.push({ key, data })
  }
  const deletes = Object.keys(current).filter((k) => !(k in next))
  return { upserts, deletes }
}

/** 在条目表上应用写入集合（乐观更新用） */
export function applyOps(current: EntryMap, ops: SyncOps): EntryMap {
  const out: EntryMap = { ...current }
  ops.deletes.forEach((k) => delete out[k])
  ops.upserts.forEach(({ key, data }) => {
    out[key] = data
  })
  return out
}

/** 按请求体积与条目数切批（每批独立原子提交；后端单批 ≤500 条、请求体 ≤8MB） */
export function chunkOps(ops: SyncOps, maxOps = 400, maxBytes = 6 * 1024 * 1024): SyncOps[] {
  const batches: SyncOps[] = []
  let cur: SyncOps = { upserts: [], deletes: [] }
  let bytes = 0
  const flush = () => {
    if (cur.upserts.length + cur.deletes.length > 0) batches.push(cur)
    cur = { upserts: [], deletes: [] }
    bytes = 0
  }
  for (const u of ops.upserts) {
    const size = new Blob([stableStringify(u.data)]).size
    if (cur.upserts.length + cur.deletes.length >= maxOps || (bytes + size > maxBytes && bytes > 0)) flush()
    cur.upserts.push(u)
    bytes += size
  }
  for (const d of ops.deletes) {
    if (cur.upserts.length + cur.deletes.length >= maxOps) flush()
    cur.deletes.push(d)
  }
  flush()
  return batches
}
