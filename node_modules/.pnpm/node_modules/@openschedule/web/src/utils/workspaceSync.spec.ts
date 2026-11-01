/**
 * workspaceSync — 工作台存储（D-07 一期）编解码与差量计算
 */
import { describe, expect, it } from 'vitest'
import {
  ORDER_KEY,
  VALUE_KEY,
  applyOps,
  chunkOps,
  decodeEntries,
  diffEntries,
  encodeValue,
  stableStringify,
} from './workspaceSync'

describe('stableStringify', () => {
  it('对象键顺序无关（JSONB 会重排键）', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }))
  })
  it('数组顺序敏感、undefined 字段丢弃', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]))
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }))
  })
})

describe('encodeValue / decodeEntries', () => {
  it('带唯一 id 的对象数组按条目拆存 + 顺序表，往返一致', () => {
    const value = [{ id: 'b', n: 1 }, { id: 'a', n: 2 }]
    const entries = encodeValue(value)
    expect(entries).toEqual({ [ORDER_KEY]: ['b', 'a'], b: value[0], a: value[1] })
    expect(decodeEntries(entries, [])).toEqual(value)
  })

  it('空数组编码为空顺序表，解码为 []（区别于「从未写过」）', () => {
    expect(encodeValue([])).toEqual({ [ORDER_KEY]: [] })
    expect(decodeEntries({ [ORDER_KEY]: [] }, ['fallback'])).toEqual([])
  })

  it('无 id / 重复 id / 保留键 id / 非数组 → 整体存 __value__', () => {
    expect(encodeValue([{ date: '2026-10-17' }])).toEqual({ [VALUE_KEY]: [{ date: '2026-10-17' }] })
    expect(encodeValue([{ id: 'x' }, { id: 'x' }])).toHaveProperty(VALUE_KEY)
    expect(encodeValue([{ id: '__order__' }])).toHaveProperty(VALUE_KEY)
    expect(encodeValue(['ref-1'])).toEqual({ [VALUE_KEY]: ['ref-1'] })
    expect(encodeValue({ pushEnabled: true })).toEqual({ [VALUE_KEY]: { pushEnabled: true } })
  })

  it('集合从未写过 → fallback', () => {
    expect(decodeEntries({}, ['seed'])).toEqual(['seed'])
  })

  it('顺序表缺失的条目追加在末尾，不丢数据', () => {
    expect(decodeEntries({ [ORDER_KEY]: ['a'], a: { id: 'a' }, z: { id: 'z' } }, [])).toEqual([{ id: 'a' }, { id: 'z' }])
  })
})

describe('diffEntries / applyOps', () => {
  const cur = encodeValue([{ id: 'a', t: 1 }, { id: 'b', t: 1 }])

  it('只改一条 → 只上传这一条', () => {
    const ops = diffEntries(cur, encodeValue([{ id: 'a', t: 2 }, { id: 'b', t: 1 }]))
    expect(ops).toEqual({ upserts: [{ key: 'a', data: { id: 'a', t: 2 } }], deletes: [] })
  })

  it('键顺序不同但内容相同 → 无变化', () => {
    const reordered = { [ORDER_KEY]: ['a', 'b'], a: { t: 1, id: 'a' }, b: { t: 1, id: 'b' } }
    expect(diffEntries(reordered, encodeValue([{ id: 'a', t: 1 }, { id: 'b', t: 1 }]))).toEqual({ upserts: [], deletes: [] })
  })

  it('前插一条 → 新条目 + 顺序表，删除 → delete', () => {
    const ops = diffEntries(cur, encodeValue([{ id: 'c' }, { id: 'a', t: 1 }]))
    expect(ops.upserts.map((u) => u.key).sort()).toEqual([ORDER_KEY, 'c'].sort())
    expect(ops.deletes).toEqual(['b'])
    expect(decodeEntries(applyOps(cur, ops), [])).toEqual([{ id: 'c' }, { id: 'a', t: 1 }])
  })

  it('形态切换（条目 → 整值）删除旧条目', () => {
    const ops = diffEntries(cur, encodeValue([{ noId: true }]))
    expect(ops.deletes.sort()).toEqual([ORDER_KEY, 'a', 'b'].sort())
    expect(ops.upserts).toEqual([{ key: VALUE_KEY, data: [{ noId: true }] }])
  })
})

describe('chunkOps', () => {
  it('按条目数切批，删除也计入', () => {
    const ops = { upserts: [1, 2, 3].map((n) => ({ key: `k${n}`, data: n })), deletes: ['d1', 'd2'] }
    const batches = chunkOps(ops, 2)
    expect(batches.map((b) => b.upserts.length + b.deletes.length)).toEqual([2, 2, 1])
  })

  it('按体积切批，单条超限也单独成批', () => {
    const big = 'x'.repeat(100)
    const ops = { upserts: [{ key: 'a', data: big }, { key: 'b', data: big }], deletes: [] }
    expect(chunkOps(ops, 400, 150)).toHaveLength(2)
  })
})
