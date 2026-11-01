/**
 * useTimeConflicts —— 时间冲突事项的统一数据入口（需求 7/8/9）。
 *
 * - 仅同人检测：冲突以「同一人」名下互相重叠的事项聚合（buildPersonConflicts）。
 * - 成员视角：仅返回本人冲突簇（myConflicts）。
 * - 管理视角：返回所有成员各自的冲突簇（allMemberConflicts），供按成员筛选。
 */
import { useMemo } from 'react'
import { useWorkspaceTasks } from './useWorkspaceTasks'
import { useCurrentRole } from './useCurrentRole'
import { buildPersonConflicts, type ConflictCluster } from '@/utils/taskTree'
import { useDirectory, useMe } from '@/hooks/useWorkspaceIdentity'

export function useTimeConflicts() {
  const currentUser = useMe()
  const { teamMembers } = useDirectory()
  const [tasks, setTasks] = useWorkspaceTasks()
  const role = useCurrentRole()
  const isManager = role === 'manager'

  /** 本人冲突簇 */
  const myConflicts = useMemo(() => buildPersonConflicts(tasks, currentUser.id), [tasks, currentUser.id])

  /** 所有成员各自的冲突簇（管理视角按成员筛选用） */
  const allMemberConflicts = useMemo(() => {
    const map: Record<string, ConflictCluster[]> = {}
    teamMembers.forEach((u) => {
      map[u.id] = buildPersonConflicts(tasks, u.id)
    })
    return map
  }, [tasks, teamMembers])

  return { tasks, setTasks, role, isManager, myConflicts, allMemberConflicts }
}
