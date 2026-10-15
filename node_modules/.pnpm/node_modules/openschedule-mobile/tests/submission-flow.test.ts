/**
 * 职责：提报状态机全迁移 + 落地分叉 + 列表守卫（ARCH §8 · PRD §6/§8）。
 *
 * 覆盖：
 * - `SUBMISSION_TRANSITIONS` 全组合合法 / 非法；
 * - `resolveApproveBranch` 三分支（回归红线）；
 * - member 提报 → pending（字段齐全 + reviewerIds 含全部 manager）；
 * - manager 免审直落；
 * - pending → approved / rejected（原因必填 ≥4 字）/ withdrawn（仅本人 + pending）；
 * - 既有「完成提报」task-014 / task-015 行为不变（回归红线）；
 * - 6 处列表守卫：提报记录不出现在正式列表，但出现在待审列表。
 */
import { DEMO_MANAGER_IDS, DEMO_USER_IDS, db, demoDayAt, findTask, resetDatabase } from '@/data'
import { ApiError } from '@/types'
import * as taskService from '@/services/task.service'
import * as projectService from '@/services/project.service'
import * as focusService from '@/services/focus.service'
import {
  ERR_SUBMISSION_FORBIDDEN,
  ERR_SUBMISSION_INVALID,
  canTransition,
  isSubmissionRecord,
  resolveApproveBranch,
} from '@/utils/submission'

const ME = DEMO_USER_IDS.me // user-001（manager）
const MANAGER = DEMO_USER_IDS.manager // user-004（manager）
const LINA = DEMO_USER_IDS.lina // user-002（member）
const WANGQIANG = DEMO_USER_IDS.wangqiang // user-003（member）
const SH = 'Asia/Shanghai'

beforeEach(() => {
  resetDatabase()
})

describe('resolveApproveBranch —— 落地分叉三分支', () => {
  it('source=submission & kind=project → project', () => {
    expect(resolveApproveBranch({ source: 'submission', submissionKind: 'project' })).toBe('project')
  })

  it('source=submission & kind=task → task', () => {
    expect(resolveApproveBranch({ source: 'submission', submissionKind: 'task' })).toBe('task')
  })

  it('既有「完成提报」（无 submissionKind）→ completion', () => {
    expect(resolveApproveBranch({ source: 'submission', submissionKind: null })).toBe('completion')
    expect(resolveApproveBranch({ source: 'submission' })).toBe('completion')
    expect(resolveApproveBranch({ source: 'published', submissionKind: 'task' })).toBe('completion')
  })

  it('isSubmissionRecord 只认同 source=submission & submissionKind 非空', () => {
    expect(isSubmissionRecord({ source: 'submission', submissionKind: 'task' })).toBe(true)
    expect(isSubmissionRecord({ source: 'submission', submissionKind: 'project' })).toBe(true)
    // 种子完成提报（task-014/015）无 submissionKind → 非提报记录
    expect(isSubmissionRecord({ source: 'submission' })).toBe(false)
    expect(isSubmissionRecord({ source: 'published', submissionKind: 'task' })).toBe(false)
    expect(isSubmissionRecord(null)).toBe(false)
  })
})

describe('SUBMISSION_TRANSITIONS —— 全组合合法 / 非法', () => {
  it('合法迁移', () => {
    expect(canTransition('draft', 'pending')).toBe(true)
    expect(canTransition('draft', 'published')).toBe(true)
    expect(canTransition('pending', 'approved')).toBe(true)
    expect(canTransition('pending', 'rejected')).toBe(true)
    expect(canTransition('pending', 'withdrawn')).toBe(true)
    expect(canTransition('rejected', 'draft')).toBe(true)
    expect(canTransition('withdrawn', 'draft')).toBe(true)
  })

  it('非法迁移', () => {
    expect(canTransition('draft', 'approved')).toBe(false)
    expect(canTransition('pending', 'draft')).toBe(false)
    expect(canTransition('pending', 'published')).toBe(false)
    expect(canTransition('approved', 'pending')).toBe(true)
    expect(canTransition('approved', 'rejected')).toBe(false)
    expect(canTransition('rejected', 'approved')).toBe(false)
    expect(canTransition('withdrawn', 'approved')).toBe(false)
  })
})

describe('member 提报 —— 生成 pending 记录（US2-01）', () => {
  it('kind=task：字段齐全，reviewerIds 非空且含全部 manager', async () => {
    const record = await taskService.submitItem(
      { kind: 'task', title: '新任务：导出能力', description: '补充 CSV 导出', projectId: 'project-002', dueAt: demoDayAt(5, 18, 0), estimatedHours: 6 },
      LINA,
    )
    expect(record.source).toBe('submission')
    expect(record.submissionKind).toBe('task')
    expect(record.submissionStatus).toBe('pending')
    expect(record.status).toBe('todo')
    expect(record.reviewRequired).toBe(true)
    expect(record.projectId).toBe('project-002')
    expect(record.createdBy).toBe(LINA)
    expect(record.assigneeId).toBeNull()

    expect(record.reviewerIds).toBeDefined()
    expect((record.reviewerIds ?? []).length).toBeGreaterThan(0)
    DEMO_MANAGER_IDS.forEach((managerId) => {
      expect(record.reviewerIds).toContain(managerId)
    })

    // 提报人可见；他人不可见
    const mine = await taskService.listMySubmissions(LINA)
    expect(mine.some((t) => t.id === record.id)).toBe(true)
    const others = await taskService.listMySubmissions(WANGQIANG)
    expect(others.some((t) => t.id === record.id)).toBe(false)

    // 出现在待我审核
    const pending = await taskService.listPendingReview(ME)
    expect(pending.some((t) => t.id === record.id)).toBe(true)
  })

  it('kind=project：assigneeId 承载拟负责人，projectId 为空', async () => {
    const record = await taskService.submitItem(
      { kind: 'project', title: '新项目：性能专项', ownerId: MANAGER, dueAt: demoDayAt(20, 18, 0) },
      LINA,
    )
    expect(record.submissionKind).toBe('project')
    expect(record.submissionStatus).toBe('pending')
    expect(record.projectId).toBeNull()
    expect(record.assigneeId).toBe(MANAGER)
  })

  it('空标题被拒绝（42202）', async () => {
    await expect(taskService.submitItem({ kind: 'task', title: '   ' }, LINA)).rejects.toMatchObject({
      code: ERR_SUBMISSION_INVALID,
    })
  })
})

describe('manager 免审直落（US2-05 / US2-08）', () => {
  it('kind=task：提报记录归档为 approved，同时落地正式 Task', async () => {
    const record = await taskService.submitItem(
      { kind: 'task', title: '直落任务：缓存优化', projectId: 'project-002' },
      ME,
    )
    expect(record.submissionStatus).toBe('approved')
    expect(record.status).toBe('cancelled') // 归档
    expect(record.reviewedBy).toBe(ME)

    // 落地为正式 Task（source='published'、status='todo'），可被项目任务列表查到
    const landed = db.tasks.find((t) => t.title === '直落任务：缓存优化' && t.source === 'published')
    expect(landed).toBeDefined()
    expect(landed?.status).toBe('todo')
    expect(landed?.projectId).toBe('project-002')
    expect(isSubmissionRecord(landed!)).toBe(false)

    const projectTasks = await taskService.listTasksByProject('project-002')
    expect(projectTasks.some((t) => t.id === landed?.id)).toBe(true)

    // 不进入待我审核
    const pending = await taskService.listPendingReview(ME)
    expect(pending.some((t) => t.id === record.id)).toBe(false)
  })

  it('kind=project：落地正式 Project（仅空项目，Q2-2）', async () => {
    const record = await taskService.submitItem(
      { kind: 'project', title: '直落项目：监控体系', ownerId: MANAGER },
      ME,
    )
    expect(record.submissionStatus).toBe('approved')
    expect(record.status).toBe('cancelled')

    const landed = db.projects.find((p) => p.name === '直落项目：监控体系')
    expect(landed).toBeDefined()
    expect(landed?.status).toBe('active')
    expect(landed?.createdBy).toBe(ME)
    // 无自动创建的首个任务
    expect(db.tasks.some((t) => t.projectId === landed?.id)).toBe(false)

    const fetched = await projectService.getProject(landed!.id)
    expect(fetched.id).toBe(landed?.id)
  })

  it('显式 role 参数可覆盖 actor 推导（member 视图）', async () => {
    const record = await taskService.submitItem({ kind: 'task', title: '角色覆盖用例' }, ME, 'member')
    expect(record.submissionStatus).toBe('pending')
  })
})

describe('pending → approved（member 提报经审核落地）', () => {
  it('kind=task：审核通过 → 落地正式 Task，提报记录归档', async () => {
    const record = await taskService.submitItem(
      { kind: 'task', title: '待审任务：埋点规范', projectId: 'project-002' },
      LINA,
    )
    const approved = await taskService.reviewSubmission(record.id, 'approve', record.version)
    expect(approved.submissionStatus).toBe('approved')
    expect(approved.status).toBe('cancelled') // 归档
    expect(approved.reviewedBy).not.toBeNull()

    const landed = db.tasks.find((t) => t.title === '待审任务：埋点规范' && t.source === 'published')
    expect(landed?.status).toBe('todo')
    expect((await taskService.listTasksByProject('project-002')).some((t) => t.id === landed?.id)).toBe(true)
  })

  it('kind=project：审核通过 → 落地正式 Project', async () => {
    const record = await taskService.submitItem(
      { kind: 'project', title: '待审项目：可观测性', ownerId: MANAGER },
      LINA,
    )
    const approved = await taskService.reviewSubmission(record.id, 'approve', record.version)
    expect(approved.submissionStatus).toBe('approved')
    expect(db.projects.some((p) => p.name === '待审项目：可观测性')).toBe(true)
  })
})

describe('pending → rejected（原因必填 ≥4 字，PRD §6）', () => {
  it('原因不足 4 字被拒绝（42202），且不改动记录', async () => {
    const record = await taskService.submitItem({ kind: 'task', title: '驳回用例' }, LINA)
    await expect(
      taskService.reviewSubmission(record.id, 'reject', record.version, '短'),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_INVALID })
    await expect(
      taskService.reviewSubmission(record.id, 'reject', record.version, undefined),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_INVALID })
    expect(findTask(record.id)?.submissionStatus).toBe('pending')
  })

  it('合法原因 → rejected 且原因回流，记录归档', async () => {
    const record = await taskService.submitItem({ kind: 'task', title: '驳回用例2' }, LINA)
    const rejected = await taskService.reviewSubmission(
      record.id,
      'reject',
      record.version,
      '信息不充分，请补充验收标准',
    )
    expect(rejected.submissionStatus).toBe('rejected')
    expect(rejected.reviewNote).toBe('信息不充分，请补充验收标准')
    expect(rejected.status).toBe('cancelled') // 新事项提报驳回归档

    const pending = await taskService.listPendingReview(ME)
    expect(pending.some((t) => t.id === record.id)).toBe(false)

    // 增量 7.9 接缝：service → 提报人页 的数据传递（走**真实** listMySubmissions，不 mock）。
    // 若真接口不返回 auditLogs，提报人页会静默回落成「已驳回」——本断言钉住该契约。
    const reworkRecord = await taskService.submitItem({ kind: 'task', title: '退回重改用例' }, LINA)
    await taskService.reviewSubmission(
      reworkRecord.id,
      'reject',
      reworkRecord.version,
      '请补充验收标准',
      ME,
      'rework',
    )
    const mine = await taskService.listMySubmissions(LINA)
    const item = mine.find((t) => t.id === reworkRecord.id)
    expect(item).toBeDefined()
    expect(item?.submissionStatus).toBe('rejected') // 组件侧 isReworkSubmission 条件①
    expect(item?.auditLogs?.at(-1)?.opinion).toBe('rework') // 条件②：留痕随记录回流提报人页
  })
})

describe('pending → withdrawn（仅本人 + pending，US2-02）', () => {
  it('非本人撤回被拒绝（40302）', async () => {
    const record = await taskService.submitItem({ kind: 'task', title: '撤回用例' }, LINA)
    await expect(
      taskService.withdrawSubmission(record.id, record.version, WANGQIANG),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })
  })

  it('本人撤回成功置 withdrawn 并移出待审', async () => {
    const record = await taskService.submitItem({ kind: 'task', title: '撤回用例2' }, LINA)
    const withdrawn = await taskService.withdrawSubmission(record.id, record.version, LINA)
    expect(withdrawn.submissionStatus).toBe('withdrawn')
    expect(withdrawn.status).toBe('cancelled')

    const pending = await taskService.listPendingReview(ME)
    expect(pending.some((t) => t.id === record.id)).toBe(false)
  })

  it('非 pending 不可撤回（40302）', async () => {
    const record = await taskService.submitItem({ kind: 'task', title: '撤回用例3' }, LINA)
    const withdrawn = await taskService.withdrawSubmission(record.id, record.version, LINA)
    await expect(
      taskService.withdrawSubmission(record.id, withdrawn.version, LINA),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })
  })
})

describe('回归红线：既有「完成提报」行为完全不变', () => {
  it('task-014 approve → submissionStatus=approved 且 status=done', async () => {
    const before = findTask('task-014')!
    expect(isSubmissionRecord(before)).toBe(false)
    const approved = await taskService.reviewSubmission('task-014', 'approve', before.version)
    expect(approved.submissionStatus).toBe('approved')
    expect(approved.status).toBe('done')
    expect(approved.completedAt).not.toBeNull()
  })

  it('task-015 reject → submissionStatus=rejected 且回到 in_progress', async () => {
    const before = findTask('task-015')!
    const rejected = await taskService.reviewSubmission('task-015', 'reject', before.version, '说明不充分')
    expect(rejected.submissionStatus).toBe('rejected')
    expect(rejected.status).toBe('in_progress')
    expect(rejected.reviewNote).toBe('说明不充分')
  })
})

describe('列表守卫 —— 提报记录不出现在正式列表（ARCH §7/§8）', () => {
  it('pending 提报记录不出现在正式列表，但出现在待审列表', async () => {
    const record = await taskService.submitItem(
      { kind: 'task', title: '守卫用例', projectId: 'project-002', dueAt: demoDayAt(0, 18, 0) },
      LINA,
    )
    // 补充 startAt（排期 / 日历守卫验证）
    const live = findTask(record.id)!
    live.assigneeId = ME
    live.startAt = demoDayAt(0, 11, 0)
    live.endAt = demoDayAt(0, 12, 0)

    const todayDue = await taskService.listTodayDue(ME, SH)
    expect(todayDue.some((t) => t.id === record.id)).toBe(false)

    const approaching = await taskService.listDeadlineApproaching(ME, SH)
    expect(approaching.some((t) => t.id === record.id)).toBe(false)

    const myTodos = await taskService.listMyTodos(ME)
    expect(myTodos.some((t) => t.id === record.id)).toBe(false)

    const projectTasks = await taskService.listTasksByProject('project-002')
    expect(projectTasks.some((t) => t.id === record.id)).toBe(false)

    const board = await projectService.listBoardColumns('project-002')
    expect(board.flatMap((column) => column.tasks).some((t) => t.id === record.id)).toBe(false)

    const scheduled = await taskService.listScheduledTasks(SH)
    expect(scheduled.some((t) => t.id === record.id)).toBe(false)

    const calendarDay = await focusService.getCalendarDay(ME, SH, 0)
    expect(calendarDay.blocks.some((block) => block.sourceId === record.id)).toBe(false)

    // 唯一例外：待我审核列表应包含它
    const pending = await taskService.listPendingReview(ME)
    expect(pending.some((t) => t.id === record.id)).toBe(true)
  })
})

describe('ApiError 类型一致性', () => {
  it('提报校验失败抛 ApiError', async () => {
    const error = (await taskService
      .submitItem({ kind: 'task', title: '' }, LINA)
      .catch((e) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe(ERR_SUBMISSION_INVALID)
  })
})

describe('审核结果站内通知（M2-P1-03）', () => {
  it('approve 一条 pending 提报 → 队首新增 1 条 review.result 通知', async () => {
    const before = db.notifications.length
    const record = await taskService.submitItem({ kind: 'task', title: '通知用例：埋点规范' }, LINA)
    await taskService.reviewSubmission(record.id, 'approve', record.version)

    expect(db.notifications.length).toBe(before + 1)
    const latest = db.notifications[0]
    expect(latest.type).toBe('review.result')
    expect(latest.userId).toBe(record.createdBy)
    expect(latest.data?.taskId).toBe(record.id)
    expect(latest.readAt).toBeNull()
    expect(latest.title).toContain('通过')
  })

  it('reject 一条 pending 提报 → 新增通知的正文包含驳回原因', async () => {
    const before = db.notifications.length
    const record = await taskService.submitItem({ kind: 'task', title: '通知用例：驳回原因' }, LINA)
    const reason = '验收标准缺失，请补充后重提'
    await taskService.reviewSubmission(record.id, 'reject', record.version, reason)

    expect(db.notifications.length).toBe(before + 1)
    const latest = db.notifications[0]
    expect(latest.type).toBe('review.result')
    expect(latest.userId).toBe(record.createdBy)
    expect(latest.data?.taskId).toBe(record.id)
    expect(latest.readAt).toBeNull()
    expect(latest.body).toContain(reason)
  })

  it('reject 原因不足 4 字抛错 → 不产生任何通知', async () => {
    const before = db.notifications.length
    const record = await taskService.submitItem({ kind: 'task', title: '通知用例：短原因' }, LINA)
    await expect(
      taskService.reviewSubmission(record.id, 'reject', record.version, '短'),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_INVALID })
    expect(db.notifications.length).toBe(before)
  })
})
