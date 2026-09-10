/**
 * useSyncSettings —— 日历同步设置与幂等记录
 *
 * - 设置：方向（推送/拉取）、范围、频率、冲突策略、启用的渠道。
 * - 幂等：记录已导入的外部事件 sourceRef，避免同一事件重复生成个人计划。
 */
import { useCallback } from 'react'
import { useLocalStorageState } from './useLocalStorageState'
import type { ImProvider } from '@/services/imProvider'

export interface SyncSettings {
  /** 任务/项目 → 渠道日历（单向推送） */
  pushEnabled: boolean
  /** 渠道日历事件 → 个人计划（反向同步） */
  pullEnabled: boolean
  scope: 'mine' | 'team'
  frequency: 'manual' | 'hourly' | 'daily'
  conflict: 'skip' | 'overwrite' | 'duplicate'
  providers: ImProvider[]
}

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  pushEnabled: true,
  pullEnabled: true,
  scope: 'mine',
  frequency: 'daily',
  conflict: 'skip',
  providers: ['feishu', 'dingtalk'],
}

const SETTINGS_KEY = 'calendar_sync_settings'
const REFS_KEY = 'calendar_synced_refs'

export function useSyncSettings() {
  const [settings, setSettings] = useLocalStorageState<SyncSettings>(SETTINGS_KEY, DEFAULT_SYNC_SETTINGS)
  const [syncedRefs, setSyncedRefs] = useLocalStorageState<string[]>(REFS_KEY, [])

  const update = useCallback(
    (patch: Partial<SyncSettings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [setSettings],
  )

  const reset = useCallback(() => setSettings(DEFAULT_SYNC_SETTINGS), [setSettings])

  /** 已导入过返回 true（调用方应跳过） */
  const isSynced = useCallback((ref: string) => syncedRefs.includes(ref), [syncedRefs])

  /** 标记一批事件为已导入 */
  const markSynced = useCallback(
    (refs: string[]) => setSyncedRefs((prev) => Array.from(new Set([...prev, ...refs]))),
    [setSyncedRefs],
  )

  const clearSynced = useCallback(() => setSyncedRefs([]), [setSyncedRefs])

  return { settings, update, reset, syncedRefs, isSynced, markSynced, clearSynced }
}
