/**
 * 职责：Mock 种子数据完整性（A4）—— 字段齐全、关联 ID 可解析、时间随演示日滚动。
 * 依据 ARCH §2/§4 与 T02 验收「时间随演示日滚动；字段与 Prisma 对齐」。
 */
import {
  DEMO_USER_IDS,
  TENANT_ID,
  demoDayAt,
  mockAttachments,
  mockComments,
  mockProjects,
  mockTasks,
  mockTimeEntries,
  mockUsers,
} from '@/data'
import { toDateKey } from '@/utils/date'

const SH = 'Asia/Shanghai'
const userIds = new Set(mockUsers.map((u) => u.id))
const projectIds = new Set(mockProjects.map((p) => p.id))
const taskIds = new Set(mockTasks.map((t) => t.id))

describe('种子数据 —— 关联 ID 可解析', () => {
  it('task.assigneeId（非空）均能在 users 中找到', () => {
    mockTasks.forEach((task) => {
      if (task.assigneeId !== null) {
        expect(userIds.has(task.assigneeId)).toBe(true)
      }
    })
  })

  it('task.projectId（非空）均能在 projects 中找到', () => {
    mockTasks.forEach((task) => {
      if (task.projectId !== null) {
        expect(projectIds.has(task.projectId)).toBe(true)
      }
    })
  })

  it('task.createdBy 均能在 users 中找到', () => {
    mockTasks.forEach((task) => {
      expect(userIds.has(task.createdBy)).toBe(true)
    })
  })

  it('comment.taskId / authorId 可解析', () => {
    mockComments.forEach((comment) => {
      expect(taskIds.has(comment.taskId)).toBe(true)
      if (comment.authorId !== null) expect(userIds.has(comment.authorId)).toBe(true)
    })
  })

  it('timeEntry.taskId / userId 可解析', () => {
    mockTimeEntries.forEach((entry) => {
      expect(taskIds.has(entry.taskId)).toBe(true)
      expect(userIds.has(entry.userId)).toBe(true)
    })
  })

  it('attachment.resourceId（task 类型）可解析', () => {
    mockAttachments
      .filter((a) => a.resourceType === 'task')
      .forEach((a) => expect(taskIds.has(a.resourceId)).toBe(true))
  })
})

describe('种子数据 —— 字段齐全', () => {
  it('每个 task 必填字段非 undefined', () => {
    const required: (keyof (typeof mockTasks)[number])[] = [
      'id',
      'tenantId',
      'title',
      'status',
      'priority',
      'createdBy',
      'tags',
      'sortOrder',
      'isAiGenerated',
      'version',
      'createdAt',
      'updatedAt',
    ]
    mockTasks.forEach((task) => {
      required.forEach((key) => expect(task[key]).not.toBeUndefined())
    })
  })

  it('全部种子属同一租户（多租户铁律）', () => {
    mockTasks.forEach((t) => expect(t.tenantId).toBe(TENANT_ID))
    mockProjects.forEach((p) => expect(p.tenantId).toBe(TENANT_ID))
    mockComments.forEach((c) => expect(c.tenantId).toBe(TENANT_ID))
  })

  it('覆盖全部 5 种任务状态与 4 档优先级', () => {
    const statuses = new Set(mockTasks.map((t) => t.status))
    const priorities = new Set(mockTasks.map((t) => t.priority))
    expect(statuses).toEqual(new Set(['todo', 'in_progress', 'blocked', 'done', 'cancelled']))
    expect(priorities).toEqual(new Set(['urgent', 'high', 'medium', 'low']))
  })
})

describe('种子数据 —— 时间随「演示当日」滚动（不写死过去日期）', () => {
  it('demoDayAt(0, h) 落在今天（Asia/Shanghai）', () => {
    expect(toDateKey(demoDayAt(0, 9, 0), SH)).toBe(toDateKey(new Date(), SH))
  })

  it('demoDayAt(+2) / demoDayAt(-1) 偏移正确', () => {
    const today = toDateKey(new Date(), SH)
    const plus2 = toDateKey(demoDayAt(2, 12, 0), SH)
    const minus1 = toDateKey(demoDayAt(-1, 12, 0), SH)
    const nowKey = new Date(today + 'T00:00:00.000Z')
    expect(new Date(plus2 + 'T00:00:00.000Z').getTime() - nowKey.getTime()).toBe(2 * 86_400_000)
    expect(nowKey.getTime() - new Date(minus1 + 'T00:00:00.000Z').getTime()).toBe(86_400_000)
  })

  it('存在 dueAt 落在「今天」的任务（保证今日聚焦非空）', () => {
    const today = toDateKey(new Date(), SH)
    const dueToday = mockTasks.filter((t) => t.dueAt && toDateKey(t.dueAt, SH) === today)
    expect(dueToday.length).toBeGreaterThan(0)
  })

  it('存在待我审核的提报（reviewerIds 含当前用户）', () => {
    const pending = mockTasks.filter(
      (t) =>
        t.reviewRequired === true &&
        t.submissionStatus === 'pending' &&
        (t.reviewerIds ?? []).includes(DEMO_USER_IDS.me),
    )
    expect(pending.length).toBeGreaterThan(0)
  })

  it('存在 24h 内到期的临期任务', () => {
    const nowMs = Date.now()
    const approaching = mockTasks.filter((t) => {
      if (!t.dueAt) return false
      if (t.status === 'done' || t.status === 'cancelled') return false
      const due = new Date(t.dueAt).getTime()
      return due >= nowMs - 3600_000 && due <= nowMs + 24 * 3600_000
    })
    expect(approaching.length).toBeGreaterThan(0)
  })
})
