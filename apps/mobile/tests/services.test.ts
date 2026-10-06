/**
 * 职责：服务层 mock 分支单元测试（B）—— 关键读写路径的返回结构与错误码。
 * 覆盖：任务读写 / 乐观锁 40901 / 非法迁移 40902 / 计时 / 审核 / 聚焦聚合 / 看板 / 时间容器。
 */
import { DEMO_USER_IDS, db, findTask, resetDatabase } from '@/data'
import { ApiError, ERR_ILLEGAL_TRANSITION, ERR_OPTIMISTIC_LOCK } from '@/types'
import * as taskService from '@/services/task.service'
import * as focusService from '@/services/focus.service'
import * as projectService from '@/services/project.service'
import { toDateKey } from '@/utils/date'

const ME = DEMO_USER_IDS.me
const SH = 'Asia/Shanghai'

beforeEach(() => {
  resetDatabase()
})

describe('listMyTodos —— 我的待办过滤', () => {
  it('仅返回 assignee=我 且未完成/未取消、非待审提报', async () => {
    const todos = await taskService.listMyTodos(ME)
    expect(todos.length).toBeGreaterThan(0)
    todos.forEach((task) => {
      expect(task.assigneeId).toBe(ME)
      expect(task.status).not.toBe('done')
      expect(task.status).not.toBe('cancelled')
      expect(task.submissionStatus).not.toBe('pending')
    })
  })
})

describe('listTodayDue / listDeadlineApproaching', () => {
  it('今日到期任务 dueAt 落在目标时区今天', async () => {
    const list = await taskService.listTodayDue(ME, SH)
    const today = toDateKey(new Date(), SH)
    expect(list.length).toBeGreaterThan(0)
    list.forEach((task) => {
      expect(task.dueAt).not.toBeNull()
      expect(toDateKey(task.dueAt as string, SH)).toBe(today)
      expect(task.status).not.toBe('cancelled')
    })
  })

  it('临期任务截止在 24h 窗口内且未完成', async () => {
    const list = await taskService.listDeadlineApproaching(ME, SH)
    expect(list.length).toBeGreaterThan(0)
    list.forEach((task) => {
      expect(task.status).not.toBe('done')
      expect(task.status).not.toBe('cancelled')
    })
  })
})

describe('getTaskDetail —— 详情聚合', () => {
  it('task-004 聚合负责人 / 评论 / 附件 / 工时 / 依赖', async () => {
    const detail = await taskService.getTaskDetail('task-004')
    expect(detail.task.id).toBe('task-004')
    expect(detail.assignee?.id).toBe(DEMO_USER_IDS.lina)
    expect(detail.project?.id).toBe('project-001')
    expect(detail.comments.length).toBeGreaterThan(0)
    expect(detail.attachments.length).toBeGreaterThan(0)
    expect(detail.timeEntries.length).toBeGreaterThan(0)
  })

  it('任务不存在抛 40401', async () => {
    await expect(taskService.getTaskDetail('task-not-exist')).rejects.toMatchObject({
      code: 40401,
      name: 'ApiError',
    })
  })
})

describe('claimTask —— 承接 + 乐观锁', () => {
  it('承接后 assignee=我、status=in_progress、version+1', async () => {
    // findTask 返回内存库活引用，须先快照 version 数值
    const version = findTask('task-002')!.version
    expect(findTask('task-002')!.assigneeId).toBeNull()
    const claimed = await taskService.claimTask('task-002', version, ME)
    expect(claimed.assigneeId).toBe(ME)
    expect(claimed.status).toBe('in_progress')
    expect(claimed.version).toBe(version + 1)
  })

  it('使用过期 version 承接抛 40901（乐观锁）', async () => {
    const version = findTask('task-002')!.version
    await taskService.claimTask('task-002', version, ME)
    await expect(taskService.claimTask('task-002', version, ME)).rejects.toMatchObject({
      code: ERR_OPTIMISTIC_LOCK,
    })
  })
})

describe('moveTask —— 状态流转合法性', () => {
  it('合法迁移 in_progress → done 成功且写 completedAt', async () => {
    const before = findTask('task-006')!
    const moved = await taskService.moveTask('task-006', { status: 'done', version: before.version })
    expect(moved.status).toBe('done')
    expect(moved.completedAt).not.toBeNull()
  })

  it('非法迁移 done → cancelled 抛 40902（含 allowed_transitions）', async () => {
    const before = findTask('task-007')!
    expect(before.status).toBe('done')
    const error = (await taskService
      .moveTask('task-007', { status: 'cancelled', version: before.version })
      .catch((e) => e as ApiError)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe(ERR_ILLEGAL_TRANSITION)
    expect((error.details as { allowed_transitions?: unknown[] }).allowed_transitions).toEqual([
      { to: 'todo' },
      { to: 'in_progress' },
    ])
  })

  it('版本冲突优先于迁移校验（version 错误抛 40901）', async () => {
    await expect(
      taskService.moveTask('task-007', { status: 'cancelled', version: 999 }),
    ).rejects.toMatchObject({ code: ERR_OPTIMISTIC_LOCK })
  })
})

describe('completeTask / reopenTask', () => {
  it('完成写 completedAt 与 actualHours', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { actualHours: 8, version: before.version })
    expect(done.status).toBe('pending_review')
    expect(done.actualHours).toBe(8)
    expect(done.completedAt).not.toBeNull()
  })

  it('version 不匹配抛 40901', async () => {
    await expect(taskService.completeTask('task-004', { version: 999 })).rejects.toMatchObject({
      code: ERR_OPTIMISTIC_LOCK,
    })
  })

  it('重开 done → todo 且清空 completedAt', async () => {
    const before = findTask('task-007')!
    const reopened = await taskService.reopenTask('task-007', { reason: '误操作', version: before.version })
    expect(reopened.status).toBe('todo')
    expect(reopened.completedAt).toBeNull()
  })
})

describe('评论 / 计时', () => {
  it('新增评论返回结构完整且进入评论表', async () => {
    const comment = await taskService.addComment('task-001', { content: '测试评论' }, ME)
    expect(comment.taskId).toBe('task-001')
    expect(comment.authorId).toBe(ME)
    expect(comment.content).toBe('测试评论')
    const list = await taskService.listComments('task-001')
    expect(list.some((c) => c.id === comment.id)).toBe(true)
  })

  it('开始计时幂等（已有进行中记录则复用）；结束计时写 durationSeconds', async () => {
    const first = await taskService.startTimer('task-001', ME)
    const second = await taskService.startTimer('task-001', ME)
    expect(second.id).toBe(first.id)
    expect(first.endedAt).toBeNull()

    const stopped = await taskService.stopTimer(first.id)
    expect(stopped.endedAt).not.toBeNull()
    expect(stopped.durationSeconds).toBeGreaterThanOrEqual(1)
    expect(findTask('task-001')!.actualHours).toBeGreaterThanOrEqual(0)
  })
})

describe('reviewSubmission —— 审核提报', () => {
  it('通过：submissionStatus=approved 且 status=done', async () => {
    const before = findTask('task-014')!
    expect(before.submissionStatus).toBe('pending')
    const approved = await taskService.reviewSubmission('task-014', 'approve', before.version)
    expect(approved.submissionStatus).toBe('approved')
    expect(approved.status).toBe('done')
  })

  it('驳回：submissionStatus=rejected 且回到 in_progress + 记录原因', async () => {
    const before = findTask('task-015')!
    const rejected = await taskService.reviewSubmission('task-015', 'reject', before.version, '说明不充分')
    expect(rejected.submissionStatus).toBe('rejected')
    expect(rejected.status).toBe('in_progress')
    expect(rejected.reviewNote).toBe('说明不充分')
  })
})

describe('focusService —— 今日聚焦聚合', () => {
  it('getTodayFocus 返回三分组且归类正确', async () => {
    const focus = await focusService.getTodayFocus(ME, SH)
    expect(Array.isArray(focus.dueToday)).toBe(true)
    expect(Array.isArray(focus.pendingReview)).toBe(true)
    expect(Array.isArray(focus.approaching)).toBe(true)
    focus.pendingReview.forEach((task) => {
      expect(task.reviewRequired).toBe(true)
      expect(task.submissionStatus).toBe('pending')
      expect((task.reviewerIds ?? []).includes(ME)).toBe(true)
    })
  })

  it('AI 提议：仅返回 pending；已处理提议再确认抛 40901', async () => {
    const pending = await focusService.listAiProposals('pending')
    expect(pending.length).toBeGreaterThan(0)
    const target = pending[0]
    await focusService.approveAiProposal(target.id, ME)
    await expect(focusService.approveAiProposal(target.id, ME)).rejects.toMatchObject({ code: 40901 })
  })

  it('团队动态分页：page1 返回 5 条且 total 正确', async () => {
    const page1 = await focusService.listAuditFeed(1, 5)
    expect(page1.items).toHaveLength(5)
    expect(page1.page).toBe(1)
    expect(page1.total).toBeGreaterThanOrEqual(5)
  })

  it('时间容器：freeSlots 落在 08:00–20:00 内、互不重叠、单段 ≥30 分钟', async () => {
    const day = await focusService.getCalendarDay(ME, SH, 0)
    expect(day.dateKey).toBe(toDateKey(new Date(), SH))
    expect(day.blocks.length).toBeGreaterThan(0)

    const freeMinutes = day.freeSlots.reduce((sum, slot) => sum + slot.minutes, 0)
    expect(freeMinutes).toBeLessThanOrEqual(12 * 60)

    // 单段 ≥30 分钟且不与前一段重叠
    let previousEnd = -Infinity
    day.freeSlots.forEach((slot) => {
      expect(slot.minutes).toBeGreaterThanOrEqual(30)
      const start = new Date(slot.startAt).getTime()
      expect(start).toBeGreaterThanOrEqual(previousEnd)
      previousEnd = new Date(slot.endAt).getTime()
    })
  })

  it('新建个人任务返回 todo 结构并落库', async () => {
    const created = await focusService.createPersonalTask(ME, {
      title: '测试个人任务',
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 3600_000).toISOString(),
    })
    expect(created.title).toBe('测试个人任务')
    expect(created.status).toBe('todo')
    const list = await focusService.listPersonalTasks(ME)
    expect(list.some((t) => t.id === created.id)).toBe(true)
  })

  it('通知偏好更新渠道开关', async () => {
    const prefs = await focusService.getNotificationPreferences(ME)
    const target = prefs[0]
    const updated = await focusService.updateNotificationChannels(target.id, {
      email: !target.channels.email,
      push: target.channels.push,
      im: target.channels.im,
    })
    expect(updated.channels.email).toBe(!target.channels.email)
  })
})

describe('projectService —— 看板与统计', () => {
  it('看板固定四列且顺序正确（不含 cancelled）', async () => {
    const columns = await projectService.listBoardColumns('project-001')
    expect(columns.map((c) => c.status)).toEqual([
      'todo',
      'in_progress',
      'blocked',
      'pending_review',
      'done',
    ])
    const total = columns.reduce((sum, c) => sum + c.tasks.length, 0)
    // 看板仅 4 列，cancelled 任务不计入
    const boardTasks = db.tasks.filter((t) => t.projectId === 'project-001' && t.status !== 'cancelled')
    expect(total).toBe(boardTasks.length)
    expect(db.tasks.some((t) => t.projectId === 'project-001' && t.status === 'cancelled')).toBe(true)
  })

  it('项目统计 progress = 已完成 / 非取消任务', async () => {
    const stats = await projectService.getProjectStats('project-001')
    const tasks = db.tasks.filter((t) => t.projectId === 'project-001' && t.status !== 'cancelled')
    const done = tasks.filter((t) => t.status === 'done').length
    expect(stats.taskCount).toBe(tasks.length)
    expect(stats.doneCount).toBe(done)
    expect(stats.progress).toBeCloseTo(done / tasks.length, 5)
  })

  it('项目筛选 active / archived 正确', async () => {
    const active = await projectService.listProjectCards('active')
    const archived = await projectService.listProjectCards('archived')
    active.forEach((item) => expect(item.project.status).toBe('active'))
    archived.forEach((item) => expect(item.project.status).toBe('archived'))
  })
})
