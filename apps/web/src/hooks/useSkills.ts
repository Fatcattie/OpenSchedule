/**
 * useSkills —— 技能库共享存储（localStorage）
 *
 * - 首次进入以示例技能作为种子。
 * - 自动迁移旧「MetaSkill 工具草稿」（saved_tools）为技能条目，历史数据不丢失。
 */
import { useCallback, useMemo } from 'react'
import { useLocalStorageState } from './useLocalStorageState'
import { newId, seedSkills } from '@/constants/intelligentDefaults'
import { mockMe } from '@/api/mock/data'
import type { SkillItem, SharedEntry } from '@/types/intelligent'

const STORAGE_KEY = 'skills'
const LEGACY_KEY = 'os_ws_v1_saved_tools'

interface LegacyTool {
  name: string
  purpose: string
  input: string
  steps: string
}

/** 把旧版「MetaSkill 工具草稿」转换为技能条目 */
function migrateLegacyTools(ownerId: string, ownerName: string): SkillItem[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(LEGACY_KEY)
  } catch {
    return []
  }
  if (!raw) return []
  let tools: LegacyTool[] = []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) tools = parsed as LegacyTool[]
  } catch {
    return []
  }
  const now = new Date().toISOString()
  return tools
    .filter((t) => t && typeof t.name === 'string' && t.name.trim())
    .map((t) => {
      const steps = (t.steps ?? '')
        .split('\n')
        .filter(Boolean)
        .map((s, i) => `${i + 1}. ${s.replace(/^\d+[.、)]\s*/, '')}`)
        .join('\n')
      const content = `---\nname: ${t.name.trim()}\ndescription: ${t.purpose || t.name} —— 由旧版工具草稿迁移\n---\n\n# ${t.name.trim()}\n\n## 用途\n${t.purpose || '（未填写）'}\n\n## 输入\n${t.input || '（未填写）'}\n\n## 执行步骤\n${steps || '（未填写）'}\n`
      return {
        id: newId('skill'),
        name: t.name.trim(),
        summary: t.purpose || `${t.name}（迁移自旧版工具草稿）`,
        content,
        tags: ['迁移'],
        version: '1.0.0',
        favorite: false,
        createdBy: ownerId,
        createdByName: ownerName,
        createdAt: now,
        updatedAt: now,
        sharedWith: [],
        shareNotes: {},
        source: 'import' as const,
      } satisfies SkillItem
    })
}

export function useSkills() {
  const [skills, setSkills] = useLocalStorageState<SkillItem[]>(STORAGE_KEY, () => [
    ...seedSkills(mockMe.id, mockMe.displayName ?? '我'),
    ...migrateLegacyTools(mockMe.id, mockMe.displayName ?? '我'),
  ])

  const create = useCallback(
    (input: Pick<SkillItem, 'name' | 'summary' | 'content'> & Partial<SkillItem>) => {
      const now = new Date().toISOString()
      const item: SkillItem = {
        id: newId('skill'),
        name: input.name,
        summary: input.summary,
        content: input.content,
        tags: input.tags ?? [],
        version: input.version ?? '1.0.0',
        favorite: input.favorite ?? false,
        createdBy: input.createdBy ?? mockMe.id,
        createdByName: input.createdByName ?? mockMe.displayName ?? '我',
        createdAt: now,
        updatedAt: now,
        sharedWith: input.sharedWith ?? [],
        shareNotes: input.shareNotes ?? {},
        source: input.source ?? 'manual',
      }
      setSkills((prev) => [item, ...prev])
      return item
    },
    [setSkills],
  )

  const update = useCallback(
    (id: string, patch: Partial<SkillItem>) => {
      setSkills((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s)),
      )
    },
    [setSkills],
  )

  const remove = useCallback(
    (id: string) => {
      setSkills((prev) => prev.filter((s) => s.id !== id))
    },
    [setSkills],
  )

  const toggleFavorite = useCallback(
    (id: string) => {
      setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, favorite: !s.favorite } : s)))
    },
    [setSkills],
  )

  const share = useCallback(
    (id: string, userIds: string[], note?: string) => {
      setSkills((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s
          const notes = { ...s.shareNotes }
          userIds.forEach((uid) => {
            if (note) notes[uid] = note
            else delete notes[uid]
          })
          return { ...s, sharedWith: userIds, shareNotes: notes }
        }),
      )
    },
    [setSkills],
  )

  const duplicate = useCallback(
    (item: SkillItem) => {
      const now = new Date().toISOString()
      const copy: SkillItem = {
        ...item,
        id: newId('skill'),
        name: `${item.name}（副本）`,
        createdBy: mockMe.id,
        createdByName: mockMe.displayName ?? '我',
        createdAt: now,
        updatedAt: now,
        sharedWith: [],
        shareNotes: {},
        favorite: false,
        source: 'import',
      }
      setSkills((prev) => [copy, ...prev])
      return copy
    },
    [setSkills],
  )

  const mine = useMemo(() => skills.filter((s) => s.createdBy === mockMe.id), [skills])

  const sharedWithMe = useMemo<SharedEntry<SkillItem>[]>(
    () =>
      skills
        .filter((s) => s.createdBy !== mockMe.id && s.sharedWith.includes(mockMe.id))
        .map((s) => ({
          item: s,
          sharedBy: s.createdBy,
          sharedByName: s.createdByName,
          note: s.shareNotes[mockMe.id],
        })),
    [skills],
  )

  return { skills, mine, sharedWithMe, create, update, remove, toggleFavorite, share, duplicate }
}
