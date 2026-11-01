/**
 * usePrompts —— 提示词库共享存储（localStorage）
 *
 * 首次进入以示例提示词作为种子；所有增删改与分享推荐均落盘，刷新不丢失。
 * 接入后端后，将 setPrompts 的读写替换为接口调用即可，上层组件无需改动。
 */
import { useCallback, useMemo } from 'react'
import { useWorkspaceState } from './useWorkspaceState'
import { USE_MOCK } from '@/api/config'
import { newId, seedPrompts } from '@/constants/intelligentDefaults'
import { useMe } from '@/hooks/useWorkspaceIdentity'
import type { PromptItem, SharedEntry } from '@/types/intelligent'

const STORAGE_KEY = 'prompts'

export function usePrompts() {
  const currentUser = useMe()
  // 示例种子仅 mock 演示使用（真实租户从空库开始，D-07）
  const [prompts, setPrompts] = useWorkspaceState<PromptItem[]>(STORAGE_KEY, () =>
    USE_MOCK ? seedPrompts(currentUser.id, currentUser.displayName ?? '我') : [],
  )

  const create = useCallback(
    (input: Pick<PromptItem, 'name' | 'summary' | 'content'> & Partial<PromptItem>) => {
      const now = new Date().toISOString()
      const item: PromptItem = {
        id: newId('prompt'),
        name: input.name,
        summary: input.summary,
        content: input.content,
        tags: input.tags ?? [],
        favorite: input.favorite ?? false,
        createdBy: input.createdBy ?? currentUser.id,
        createdByName: input.createdByName ?? currentUser.displayName ?? '我',
        createdAt: now,
        updatedAt: now,
        sharedWith: input.sharedWith ?? [],
        shareNotes: input.shareNotes ?? {},
        source: input.source ?? 'manual',
      }
      setPrompts((prev) => [item, ...prev])
      return item
    },
    [setPrompts, currentUser.id, currentUser.displayName],
  )

  const update = useCallback(
    (id: string, patch: Partial<PromptItem>) => {
      setPrompts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)),
      )
    },
    [setPrompts, currentUser.id, currentUser.displayName],
  )

  const remove = useCallback(
    (id: string) => {
      setPrompts((prev) => prev.filter((p) => p.id !== id))
    },
    [setPrompts, currentUser.id, currentUser.displayName],
  )

  const toggleFavorite = useCallback(
    (id: string) => {
      setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, favorite: !p.favorite } : p)))
    },
    [setPrompts, currentUser.id, currentUser.displayName],
  )

  /** 推荐分享给若干员工；userIds 为空表示取消推荐 */
  const share = useCallback(
    (id: string, userIds: string[], note?: string) => {
      setPrompts((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p
          const notes = { ...p.shareNotes }
          userIds.forEach((uid) => {
            if (note) notes[uid] = note
            else delete notes[uid]
          })
          return { ...p, sharedWith: userIds, shareNotes: notes }
        }),
      )
    },
    [setPrompts, currentUser.id, currentUser.displayName],
  )

  /** 复制一份到自己的库（用于「收到的推荐」保存） */
  const duplicate = useCallback(
    (item: PromptItem) => {
      const now = new Date().toISOString()
      const copy: PromptItem = {
        ...item,
        id: newId('prompt'),
        name: `${item.name}（副本）`,
        createdBy: currentUser.id,
        createdByName: currentUser.displayName ?? '我',
        createdAt: now,
        updatedAt: now,
        sharedWith: [],
        shareNotes: {},
        favorite: false,
      }
      setPrompts((prev) => [copy, ...prev])
      return copy
    },
    [setPrompts, currentUser.id, currentUser.displayName],
  )

  /** 我创建的（含我分享出去的） */
  const mine = useMemo(() => prompts.filter((p) => p.createdBy === currentUser.id), [prompts, currentUser.id])

  /** 别人推荐给我的 */
  const sharedWithMe = useMemo<SharedEntry<PromptItem>[]>(
    () =>
      prompts
        .filter((p) => p.createdBy !== currentUser.id && p.sharedWith.includes(currentUser.id))
        .map((p) => ({
          item: p,
          sharedBy: p.createdBy,
          sharedByName: p.createdByName,
          note: p.shareNotes[currentUser.id],
        })),
    [prompts, currentUser.id],
  )

  return { prompts, mine, sharedWithMe, create, update, remove, toggleFavorite, share, duplicate }
}
