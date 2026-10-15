/**
 * 职责：提报草稿纯函数测试（M2-P2-02）。
 * 覆盖：序列化 / 反序列化往返等价（全字段有值 / 全字段为空）、非法输入一律返回 null
 * （null / 空串 / 非 JSON / 空对象 / 版本号不符）、字段类型污染的类型收敛、
 * isDraftMeaningful 的空白 / 标题 / 描述判定。
 */
import type { ItemFormValue } from '@/components/ItemForm'
import {
  DRAFT_VERSION,
  createEmptyFormValue,
  isDraftMeaningful,
  parseDraft,
  serializeDraft,
} from '@/utils/draft'

/** 全字段有值的样例草稿（kind='task' 走项目分支） */
const FULL_VALUE: ItemFormValue = {
  kind: 'task',
  title: '接入支付回调',
  description: '处理异步回调与对账',
  priority: 'urgent',
  projectId: 'proj-1',
  ownerId: 'user-9',
  dueAt: '2025-10-01T09:00:00.000Z',
  estimatedHours: '6.5',
  note: '需与财务确认口径',
}

describe('serializeDraft —— 产出含版本号与保存时间的 JSON', () => {
  it('形如 { version, savedAt, value }', () => {
    const savedAt = '2025-09-27T00:00:00.000Z'
    const parsed = JSON.parse(serializeDraft(FULL_VALUE, savedAt)) as Record<string, unknown>
    expect(parsed.version).toBe(DRAFT_VERSION)
    expect(parsed.savedAt).toBe(savedAt)
    expect(parsed.value).toEqual(FULL_VALUE)
  })
})

describe('serializeDraft → parseDraft 往返等价', () => {
  it('全字段有值：往返后对象等价', () => {
    const raw = serializeDraft(FULL_VALUE, '2025-09-27T00:00:00.000Z')
    expect(parseDraft(raw)).toEqual(FULL_VALUE)
  })

  it('全字段为空（createEmptyFormValue）：往返后对象等价', () => {
    const empty = createEmptyFormValue('project')
    const raw = serializeDraft(empty, '2025-09-27T00:00:00.000Z')
    expect(parseDraft(raw)).toEqual(empty)
  })
})

describe('parseDraft —— 非法输入一律返回 null（绝不抛错）', () => {
  it('null / 空串 / 纯空白 → null', () => {
    expect(parseDraft(null)).toBeNull()
    expect(parseDraft('')).toBeNull()
    expect(parseDraft('   ')).toBeNull()
  })

  it('非 JSON 文本 → null', () => {
    expect(parseDraft('不是json')).toBeNull()
    expect(parseDraft('{ 半截')).toBeNull()
  })

  it('空对象 / 缺字段 / value 非对象 → null', () => {
    expect(parseDraft('{}')).toBeNull()
    expect(parseDraft(JSON.stringify({ version: DRAFT_VERSION }))).toBeNull()
    expect(parseDraft(JSON.stringify({ version: DRAFT_VERSION, value: 'x' }))).toBeNull()
    expect(parseDraft(JSON.stringify({ version: DRAFT_VERSION, value: [] }))).toBeNull()
  })

  it('版本号不符 → null', () => {
    const stale = JSON.stringify({ version: DRAFT_VERSION + 1, value: FULL_VALUE })
    expect(parseDraft(stale)).toBeNull()
  })

  it('kind 非法 / 缺失 → null', () => {
    expect(parseDraft(JSON.stringify({ version: DRAFT_VERSION, value: { kind: 'xxx' } }))).toBeNull()
    expect(parseDraft(JSON.stringify({ version: DRAFT_VERSION, value: {} }))).toBeNull()
  })
})

describe('parseDraft —— 字段类型污染被收敛为合法值', () => {
  it('title 非字符串 → 空串；priority 非法 → medium；projectId 非字符串 → null', () => {
    const dirty = JSON.stringify({
      version: DRAFT_VERSION,
      savedAt: '2025-09-27T00:00:00.000Z',
      value: {
        kind: 'task',
        title: 123,
        description: null,
        priority: 'xxx',
        projectId: 42,
        ownerId: { a: 1 },
        dueAt: 0,
        estimatedHours: 8,
        note: undefined,
      },
    })
    const result = parseDraft(dirty)
    expect(result).not.toBeNull()
    expect(result).toEqual({
      kind: 'task',
      title: '',
      description: '',
      priority: 'medium',
      projectId: null,
      ownerId: null,
      dueAt: null,
      estimatedHours: '',
      note: '',
    })
  })

  it('污染输入不抛异常（返回合法对象或 null）', () => {
    expect(() => parseDraft(JSON.stringify({ version: DRAFT_VERSION, value: { kind: 'task', title: [] } }))).not.toThrow()
  })
})

describe('isDraftMeaningful —— 至少填标题或描述才算有内容', () => {
  it('仅空白 → false', () => {
    const value = createEmptyFormValue('task')
    expect(isDraftMeaningful(value)).toBe(false)
    expect(isDraftMeaningful({ ...value, title: '   ', description: '  \n ' })).toBe(false)
  })

  it('有标题 → true', () => {
    const value = { ...createEmptyFormValue('task'), title: '做点什么' }
    expect(isDraftMeaningful(value)).toBe(true)
  })

  it('仅描述 → true', () => {
    const value = { ...createEmptyFormValue('task'), description: '只有描述' }
    expect(isDraftMeaningful(value)).toBe(true)
  })
})
