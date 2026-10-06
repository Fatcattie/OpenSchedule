/**
 * 职责：提报草稿的**纯函数**（序列化 / 反序列化 / 空值 / 有效性判定 · M2-P2-02）。
 *
 * 全部为纯函数，无 React、无 AsyncStorage 依赖，便于独立单测；页面仅负责把读写
 * 落到 AsyncStorage（见 SubmissionScreen）。反序列化必须**防御性**：任何非法输入
 * 一律返回 null，绝不抛异常，避免脏数据阻断提报主流程。
 */
import type { ItemFormValue } from '@/components/ItemForm'
import type { SubmissionKind, TaskPriority } from '@/types'

/** 草稿版本号（结构变更时递增，旧版本草稿自动失效） */
export const DRAFT_VERSION = 1

/** 合法的提报类型集合（用于反序列化收敛） */
const VALID_KINDS: readonly SubmissionKind[] = ['project', 'task']
/** 合法的优先级集合（用于反序列化收敛，非法回落 'medium'） */
const VALID_PRIORITIES: readonly TaskPriority[] = ['urgent', 'high', 'medium', 'low']

/** 空表单值（kind 由调用方给定） */
export function createEmptyFormValue(kind: SubmissionKind): ItemFormValue {
  return {
    kind,
    title: '',
    description: '',
    priority: 'medium',
    projectId: null,
    ownerId: null,
    dueAt: null,
    estimatedHours: '',
    note: '',
  }
}

/** 草稿是否「有内容」（用户至少填了标题或描述才值得保存 / 恢复） */
export function isDraftMeaningful(value: ItemFormValue): boolean {
  return value.title.trim().length > 0 || value.description.trim().length > 0
}

/** 序列化草稿为字符串（含版本号与保存时间） */
export function serializeDraft(value: ItemFormValue, savedAt: string): string {
  return JSON.stringify({ version: DRAFT_VERSION, savedAt, value })
}

/** 值是否为「非 null 的对象」（排除数组） */
function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

/** 字符串字段收敛：非字符串 → 空串 */
function toText(input: unknown): string {
  return typeof input === 'string' ? input : ''
}

/** 可空字符串字段收敛：非字符串 → null */
function toNullableText(input: unknown): string | null {
  return typeof input === 'string' ? input : null
}

/**
 * 反序列化草稿：格式非法 / 版本不符 / 非对象 / kind 非法 → 返回 null（绝不抛错）。
 * 其余字段做类型收敛，保证返回对象一定是合法 ItemFormValue。
 */
export function parseDraft(raw: string | null): ItemFormValue | null {
  if (raw === null || raw.trim().length === 0) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isPlainObject(parsed)) return null
  if (parsed.version !== DRAFT_VERSION) return null
  if (!isPlainObject(parsed.value)) return null

  const source = parsed.value
  const kind = source.kind
  if (typeof kind !== 'string' || !VALID_KINDS.includes(kind as SubmissionKind)) return null

  const priority = source.priority
  const resolvedPriority: TaskPriority = VALID_PRIORITIES.includes(priority as TaskPriority)
    ? (priority as TaskPriority)
    : 'medium'

  return {
    kind: kind as SubmissionKind,
    title: toText(source.title),
    description: toText(source.description),
    priority: resolvedPriority,
    projectId: toNullableText(source.projectId),
    ownerId: toNullableText(source.ownerId),
    dueAt: toNullableText(source.dueAt),
    estimatedHours: toText(source.estimatedHours),
    note: toText(source.note),
  }
}
