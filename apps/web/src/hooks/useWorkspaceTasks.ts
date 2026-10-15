/**
 * 职责：工作台任务共享存储 + 集中式通知触发
 *
 * 协作工作台、任务执行页、任务创建管理页需要读写同一份任务数据。
 * 统一走这个 hook 保证 storage key 与字段补齐逻辑一致，避免各页面各存一份导致数据割裂。
 *
 * 通知触发（第九批框架落地）：
 * - 审批进入待审：proposal/assign/content/completion 任一 pending 出现 → approval_pending
 * - 行为事件 diff：任务创建/承接/指派/改派/内容修改/完成/删除/评审邀请/评审完成/项目审核通过
 * - 时间扫描：任务/计划到期前 1 天与当天、已逾期、今日提醒事件到期
 * 所有通知通过 useNotifications 写入（按角色过滤可见性，manager 全量 / member 仅 personal 相关）
 */
import { useEffect, useMemo, useRef } from 'react'
import { useLocalStorageState } from './useLocalStorageState'
import { useNotifications } from './useNotifications'
import { mockMe, mockTasks, mockUsers } from '@/api/mock/data'
import { normalizeTasks, taskRoute, toWorkspaceTask } from '@/utils/taskTree'
import { buildProjectTasksFromSop } from '@/utils/taskFactory'
import { nextCyclicChild } from '@/utils/recurrence'
import { APPROVAL_TYPE_META, type WorkspaceTask } from '@/types'
import dayjs from 'dayjs'

/** mock 种子任务补齐为工作台任务（含任务模式、评审、提报等协作字段） */
export const cloneTasks = (): WorkspaceTask[] => {
  const base = normalizeTasks(structuredClone(mockTasks).map((t) => toWorkspaceTask(t as WorkspaceTask)))
  // 演示种子：一个已生效的团队协作项目 + 其 SOP 生成的项目内任务（需求 1 审核通过后的形态）
  const now = new Date().toISOString()

  // 演示种子：把 task-004（首页原型设计）直接置为「完成提报待审」。
  // 原因：审核中心的「审核」按钮只在「待审核」栏有数据时才渲染（AuditPage 待审核栏），
  // 而种子任务默认 approvalStatus='none' ⇒ 全新会话打开审核页恒为「暂无」，看不到任何审核按钮。
  // 这里预置一条待审事项，使演示/验收开箱即可走完整审核流（待提报 -1、待审核 +1）。
  const seededPending: WorkspaceTask[] = base.map((t) =>
    t.id === 'task-004'
      ? {
          ...t,
          approvalStatus: 'pending' as const,
          approvalType: 'completion' as const,
          completion: {
            completedAt: dayjs().format('YYYY-MM-DD HH:mm'),
            tags: ['按计划完成'],
            notes: '先锁定设计 token 再走查，返工明显减少',
            sopImprovement: '建议把设计 token 评审前置到需求阶段',
            suggestions: '提前与后端确认接口字段',
            summary: '已完成首屏与导航高保真原型，列表页待补充',
            aiGenerated: false,
          },
          updatedAt: now,
        }
      : t,
  )
  const demoProject: WorkspaceTask = {
    id: 'project-demo-001', tenantId: 'tenant-001', projectId: 'project-001', parentId: null,
    title: '官网 2.0 改版（演示项目）', description: '团队协作项目演示：审核通过后按 SOP 生成项目内任务，可进入项目详情调整流程顺序、增删任务。',
    status: 'in_progress', priority: 'high', assigneeId: 'user-001',
    dueAt: new Date(Date.now() + 30 * 86400000).toISOString(), estimatedHours: 0, actualHours: null,
    completedAt: null, startedAt: now, createdBy: 'user-001',
    tags: ['团队协作项目', '互联网/软件', '前端开发'], sortOrder: 0, workflowColumnId: null, isAiGenerated: false,
    version: 1, createdAt: now, updatedAt: now,
    taskMode: 'project', kind: 'project', needReview: false, reviewStatus: 'none',
    proposalStatus: 'none', participants: [], reviewOfTaskId: null,
    startAt: now, endAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    importance: 'important', urgencyDegree: 'urgent',
    sop: {
      steps: [
        { id: 'sp-1', title: '需求梳理与范围确认', children: [] },
        { id: 'sp-2', title: '视觉设计定稿', children: [] },
        { id: 'sp-3', title: '前端开发联调', children: [] },
        { id: 'sp-4', title: '上线验收与复盘', children: [] },
      ],
      source: 'manual',
      updatedAt: now,
    },
    approvalStatus: 'approved', approvalType: null, recommendedAssigneeId: null,
    pendingContent: null, executionLogs: [], comments: [], completion: null,
    auditLogs: [{ id: 'al-demo', taskId: 'project-demo-001', action: 'approve', opinion: 'agree', reason: '演示种子：项目已审核通过', operatorId: 'user-admin', operatorName: '管理员', createdAt: now }],
    dailyPlans: [], isDraft: false, pendingDelete: false, pendingSop: null,
  }
  const demoChildTasks = buildProjectTasksFromSop(demoProject, demoProject.sop!)
  return [demoProject, ...demoChildTasks, ...seededPending]
}

/** 用户显示名 */
const displayName = (uid: string | null | undefined) =>
  uid ? (mockUsers.find((u) => u.id === uid)?.displayName ?? uid) : ''

/**
 * 返回 [规范化后的任务列表, 写入函数]。
 * 写入函数接收的是原始存储值（可能缺字段），调用方只做展开与整体替换即可。
 */
export function useWorkspaceTasks() {
  const [stored, setStored] = useLocalStorageState<WorkspaceTask[]>('tasks', cloneTasks)
  const tasks = useMemo(() => normalizeTasks(stored), [stored])
  const { addNotification } = useNotifications()

  // ───────────────── 审批待审通知（保留原逻辑并改造） ─────────────────
  const prevPendingRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    const nowPending = new Set(
      tasks.filter((t) => t.approvalStatus === 'pending').map((t) => t.id),
    )
    if (prevPendingRef.current) {
      tasks.forEach((t) => {
        if (t.approvalStatus === 'pending' && !prevPendingRef.current!.has(t.id)) {
          const label = t.approvalType
            ? APPROVAL_TYPE_META[t.approvalType]?.label ?? '待审事项'
            : '待审事项'
          const byName = displayName(t.recommendedAssigneeId ?? t.assigneeId ?? t.createdBy)
          addNotification({
            eventType: 'approval_pending',
            title: t.approvalType === 'completion'
              ? `${byName} 提报完成「${t.title}」`
              : `「${t.title}」有${label}待处理`,
            body: `${label}：${t.approvalType === 'assign' && t.recommendedAssigneeId ? `推荐承接人 ${displayName(t.recommendedAssigneeId)}` : '请到审核中心处理'}`,
            scope: 'manager',
            data: { taskId: t.id, route: '/audit' },
            relatedUserIds: [t.createdBy, t.assigneeId ?? '', t.recommendedAssigneeId ?? ''].filter(Boolean),
            dedupKey: `approval_pending:${t.id}`,
          })
        }
      })
    }
    prevPendingRef.current = nowPending
  }, [tasks, addNotification])

  // ───────────────── 行为事件 diff（对比前后任务状态） ─────────────────
  const prevTasksRef = useRef<WorkspaceTask[] | null>(null)
  useEffect(() => {
    const prev = prevTasksRef.current
    prevTasksRef.current = tasks
    if (!prev) return // 首次挂载不触发（避免把种子当新增刷屏）

    const prevById = new Map(prev.map((t) => [t.id, t]))

    const parentAssignee = (t: WorkspaceTask) => {
      if (!t.parentId) return null
      return prevById.get(t.parentId)?.assigneeId ?? null
    }

    /** 去重后的相关用户集合 */
    const uniq = (...ids: (string | null | undefined)[]) =>
      Array.from(new Set(ids.filter((x): x is string => Boolean(x))))

    const relatedOf = (t: WorkspaceTask) =>
      uniq(t.assigneeId, t.createdBy, parentAssignee(t), ...t.participants)

    /** 新增任务：成员提报（pending）交给 approval_pending，这里只处理直接创建生效的任务 */
    const onAdded = (cur: WorkspaceTask) => {
      if (cur.isDraft || cur.kind === 'project') return
      if (cur.approvalStatus === 'pending') return
      if (cur.kind === 'review') return
      const kindLabel = cur.kind === 'plan' ? '个人计划' : '任务'
      addNotification({
        eventType: 'task_created',
        title: `${displayName(cur.createdBy)} 创建了${kindLabel}「${cur.title}」`,
        body: cur.assigneeId ? `承接人：${displayName(cur.assigneeId)}` : '暂无承接人',
        data: { taskId: cur.id, route: taskRoute(tasks, cur) },
        scope: 'manager',
        relatedUserIds: relatedOf(cur),
      })
    }

    /** 任务变化 */
    const onChanged = (prevTask: WorkspaceTask, cur: WorkspaceTask) => {
      // 1) 项目审核通过（SOP 生成项目任务）
      if (
        cur.kind === 'project' &&
        prevTask.approvalStatus === 'pending' &&
        cur.approvalStatus === 'approved'
      ) {
        addNotification({
          eventType: 'project_approved',
          title: `项目「${cur.title}」已审核通过`,
          body: '已按 SOP 流程自动生成项目内任务，可进入项目详情查看',
          data: { projectId: cur.id, route: `/projects/${cur.id}` },
          scope: 'manager',
          relatedUserIds: uniq(cur.createdBy, cur.assigneeId),
          dedupKey: `project_approved:${cur.id}`,
        })
        return
      }

      // 2) 通用审批结果（完成提报「通过」由完成事件覆盖；「驳回」仍单独通知提报人）
      if (
        prevTask.approvalStatus === 'pending' &&
        (cur.approvalStatus === 'approved' || cur.approvalStatus === 'rejected')
      ) {
        const passed = cur.approvalStatus === 'approved'
        // 文案分叉（仅文案）：驳回时读最后一条审核留痕，opinion='rework' ⇒ 退回重改。
        // 时序保证：AuditPage.submitAudit 先 setTasks 追加带 opinion 的 AuditLog，
        // 本推导再于下一轮 effect 读取 cur.auditLogs，故末尾即最新一条。
        const lastOpinion = cur.auditLogs?.[cur.auditLogs.length - 1]?.opinion
        const isRework = !passed && lastOpinion === 'rework'
        const typeLabel = cur.approvalType ? APPROVAL_TYPE_META[cur.approvalType]?.label ?? '审批' : '审批'
        const completionApproved = cur.approvalType === 'completion' && passed
        if (!completionApproved) {
          addNotification({
            eventType: 'approval_result',
            title: passed
              ? `「${cur.title}」${typeLabel}已通过`
              : isRework
                ? `「${cur.title}」${typeLabel}已退回重改`
                : `「${cur.title}」${typeLabel}被驳回`,
            body: passed
              ? (cur.approvalType === 'assign' ? `承接人已生效：${displayName(cur.assigneeId ?? cur.recommendedAssigneeId)}` : '审核已通过，任务已生效')
              : isRework
                ? '已退回重改，请按审核意见修改后重新提交'
                : '审核未通过，请修改后重新提交',
            data: { taskId: cur.id, route: taskRoute(tasks, cur) },
            scope: 'personal',
            relatedUserIds: uniq(cur.createdBy, cur.assigneeId, cur.recommendedAssigneeId),
          })
        }
      }

      // 3) 指派/承接/改派（assigneeId 变化）
      if (cur.assigneeId !== prevTask.assigneeId) {
        const newId = cur.assigneeId
        const oldId = prevTask.assigneeId
        if (oldId && newId && oldId !== newId) {
          // 改派 A → B
          addNotification({
            eventType: 'task_reassigned',
            title: `任务「${cur.title}」承接人改派`,
            body: `由 ${displayName(oldId)} 改派给 ${displayName(newId)}`,
            data: { taskId: cur.id, route: taskRoute(tasks, cur) },
            scope: 'personal',
            relatedUserIds: uniq(oldId, newId, cur.createdBy),
          })
        } else if (!oldId && newId) {
          // 原无人承接 → 有人承接/指派。assign 审核通过场景（recommendedAssigneeId === newId）不重复发
          const viaAssignAudit =
            prevTask.approvalStatus === 'pending' &&
            cur.recommendedAssigneeId === newId
          if (!viaAssignAudit) {
            // 管理员直接指派（approvalStatus 置 approved）与成员直接承接（approvalStatus none 不变）区分
            const isManagerAssign =
              prevTask.approvalStatus !== 'pending' &&
              cur.approvalStatus === 'approved'
            if (isManagerAssign) {
              addNotification({
                eventType: 'task_assigned',
                title: `你已被指派承接任务「${cur.title}」`,
                body: `由 ${displayName(cur.createdBy)} 指派，任务已进入进行中`,
                data: { taskId: cur.id, route: taskRoute(tasks, cur) },
                scope: 'personal',
                relatedUserIds: uniq(newId, cur.createdBy),
              })
            } else {
              addNotification({
                eventType: 'task_claimed',
                title: `${displayName(newId)} 承接了任务「${cur.title}」`,
                body: '任务已进入进行中',
                data: { taskId: cur.id, route: taskRoute(tasks, cur) },
                scope: 'manager',
                relatedUserIds: relatedOf(cur),
              })
            }
          }
        }
      }

      // 4) 评审邀请（参与者新增）
      if (cur.participants.length > prevTask.participants.length) {
        const newMembers = cur.participants.filter((p) => !prevTask.participants.includes(p))
        if (newMembers.length > 0) {
          addNotification({
            eventType: 'review_invited',
            title: `你被邀请参与「${cur.title}」的评审`,
            body: `评审参与人：${newMembers.map(displayName).join('、')} · 请到任务执行页参与评审`,
            data: { taskId: cur.id, route: taskRoute(tasks, cur) },
            scope: 'personal',
            relatedUserIds: newMembers,
            dedupKey: `review_invited:${cur.id}:${newMembers.join(',')}`,
          })
        }
      }

      // 5) 任务完成（进入 done；评审任务单独处理，个人计划不打扰）
      if (cur.status === 'done' && prevTask.status !== 'done' && cur.kind !== 'plan') {
        if (cur.kind === 'review') {
          const mainId = cur.reviewOfTaskId
          const main = mainId ? tasks.find((t) => t.id === mainId) : undefined
          addNotification({
            eventType: 'review_finished',
            title: `评审「${cur.title}」已完成`,
            body: main ? `主任务「${main.title}」现可审批通过` : '评审结论已记录',
            data: { taskId: cur.id, route: main ? taskRoute(tasks, main) : taskRoute(tasks, cur) },
            scope: 'personal',
            relatedUserIds: main ? uniq(main.assigneeId, main.createdBy) : relatedOf(cur),
          })
        } else {
          addNotification({
            eventType: 'task_completed',
            title: `${displayName(cur.assigneeId ?? cur.createdBy)} 完成了任务「${cur.title}」`,
            body: cur.needReview ? '（开启评审的任务请确认评审状态）' : '任务已完成',
            data: { taskId: cur.id, route: taskRoute(tasks, cur) },
            scope: 'manager',
            relatedUserIds: relatedOf(cur),
            dedupKey: `task_completed:${cur.id}`,
          })
        }
      }

      // 6) 内容修改（标题/描述变化；content 审核应用时的变化已在审批结果覆盖，跳过）
      const contentChanged =
        prevTask.title !== cur.title || (prevTask.description ?? '') !== (cur.description ?? '')
      const fromContentAudit =
        prevTask.approvalStatus === 'pending' && prevTask.approvalType === 'content'
      if (contentChanged && !fromContentAudit) {
        addNotification({
          eventType: 'task_modified',
          title: `任务「${cur.title}」内容已更新`,
          body: prevTask.title !== cur.title ? `标题：${prevTask.title} → ${cur.title}` : '描述已更新，请注意查看',
          data: { taskId: cur.id, route: taskRoute(tasks, cur) },
          scope: 'personal',
          relatedUserIds: uniq(cur.assigneeId, cur.createdBy, ...cur.participants),
        })
      }
    }

    /** 任务被删除（数组消失）：删除申请进入待审的提醒由 approval_pending effect 承担，这里统一发「已删除」 */
    const onRemoved = (gone: WorkspaceTask) => {
      if (gone.status === 'done' || gone.kind === 'plan' || gone.isDraft) return
      addNotification({
        eventType: 'task_deleted',
        title: `任务「${gone.title}」已被删除`,
        body: `${displayName(gone.createdBy)} 发起的删除已生效`,
        data: { taskId: gone.id },
        scope: 'manager',
        relatedUserIds: uniq(gone.createdBy, gone.assigneeId),
      })
    }

    const curIdSet = new Set(tasks.map((t) => t.id))
    tasks.forEach((cur) => {
      const prevTask = prevById.get(cur.id)
      if (!prevTask) onAdded(cur)
      else onChanged(prevTask, cur)
    })
    prev.forEach((p) => {
      if (!curIdSet.has(p.id)) onRemoved(p)
    })
  }, [tasks, addNotification])

  // ───────────────── 时间扫描：到期/逾期 + 提醒事件到期 ─────────────────
  useEffect(() => {
    const todayStart = dayjs().startOf('day')
    const tomorrowStart = todayStart.add(1, 'day')
    const todayStr = todayStart.format('YYYY-MM-DD')
    const now = dayjs()

    tasks.forEach((t) => {
      if (t.status === 'done' || t.status === 'cancelled' || t.kind === 'project') return
      const dueRaw = t.dueAt ?? t.endAt
      if (!dueRaw) return
      const due = dayjs(dueRaw)
      const involved = [t.assigneeId ?? '', t.createdBy ?? ''].filter(Boolean) as string[]
      const targetName = displayName(t.assigneeId ?? t.createdBy) || '任务'
      if (due.isSame(todayStart, 'day')) {
        // 当天到期
        addNotification({
          eventType: 'deadline_approaching',
          title: `「${t.title}」今天到期`,
          body: `${due.format('HH:mm')} 截止，请及时完成`,
          data: { taskId: t.id, route: taskRoute(tasks, t) },
          scope: 'personal',
          relatedUserIds: involved.length > 0 ? involved : [mockMe.id],
          dedupKey: `deadline_today:${t.id}:${todayStr}`,
        })
      } else if (due.isSame(tomorrowStart, 'day')) {
        // 提前 1 天提醒
        addNotification({
          eventType: 'deadline_approaching',
          title: `「${t.title}」明天到期`,
          body: `${due.format('MM-DD HH:mm')} 截止，请提前安排`,
          data: { taskId: t.id, route: taskRoute(tasks, t) },
          scope: 'personal',
          relatedUserIds: involved.length > 0 ? involved : [mockMe.id],
          dedupKey: `deadline_tomorrow:${t.id}:${todayStr}`,
        })
      } else if (due.isBefore(todayStart)) {
        // 已逾期（仅提醒一次）
        addNotification({
          eventType: 'deadline_overdue',
          title: `「${t.title}」已逾期`,
          body: `${targetName} 负责 · 原截止 ${due.format('YYYY-MM-DD HH:mm')}`,
          data: { taskId: t.id, route: taskRoute(tasks, t) },
          scope: 'manager',
          relatedUserIds: involved.length > 0 ? involved : [mockMe.id],
          dedupKey: `deadline_overdue:${t.id}`,
        })
      }
    })

    // 今日提醒事件到期（读今日聚焦 reminders）
    try {
      const raw = localStorage.getItem('os_ws_v1_reminders')
      if (raw) {
        const arr = JSON.parse(raw) as Array<{ id: string; content: string; remindAt: string; done?: boolean }>
        if (Array.isArray(arr)) {
          arr.forEach((r) => {
            if (r.done) return
            const at = dayjs(r.remindAt, 'YYYY-MM-DD HH:mm')
            if (at.isSame(now, 'day') && at.isBefore(now)) {
              addNotification({
                eventType: 'reminder_due',
                title: `提醒：${r.content}`,
                body: `提醒时间 ${at.format('YYYY-MM-DD HH:mm')} 已到`,
                scope: 'personal',
                relatedUserIds: [],
                data: { reminderId: r.id },
                dedupKey: `reminder_due:${r.id}:${todayStr}`,
              })
            }
          })
        }
      }
    } catch {
      // localStorage 解析失败忽略
    }
  }, [tasks, addNotification])

  // ───────────────── 循环(完成锚点)任务：完成后自动排下一次 ─────────────────
  const spawnedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const toAdd: WorkspaceTask[] = []
    tasks.forEach((t) => {
      if (t.status !== 'done') return
      if (!t.recurrence || t.recurrence.kind !== 'cyclic' || t.recurrence.anchor !== 'completion') return
      if (spawnedRef.current.has(t.id)) return
      const group = tasks.filter((g) => g.recurrenceGroupId && g.recurrenceGroupId === t.recurrenceGroupId)
      const next = nextCyclicChild(t, group)
      if (next) {
        toAdd.push(next)
        spawnedRef.current.add(t.id)
      }
    })
    if (toAdd.length) setStored((c) => [...c, ...toAdd])
  }, [tasks, setStored])

  return [tasks, setStored] as const
}

/** 从任务标签里还原行业与任务类型 */
export function readIndustryAndType(
  task: WorkspaceTask,
): { industry: string; taskType: string } {
  const industry = task.tags.find((t) => t.includes('/') || t === '通用') ?? '通用'
  const known = [
    '前端开发', '后端开发', 'UI/UX设计', '测试/质量', '产品/需求',
    '运营/活动', '数据分析', '文档/报告', '调研/竞品', '运维/部署', '评审/合规',
  ]
  const taskType = task.tags.find((t) => known.includes(t)) ?? '通用'
  return { industry, taskType }
}
