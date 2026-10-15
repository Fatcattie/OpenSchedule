/**
 * 职责：增量提报种子数据约束（回归红线 C-4）。
 *
 * 断言 `seed.ts` 新增的 task-022（rejected）/ task-023（approved）：
 *  - `createdBy` 均为演示账号 `DEMO_USER_IDS.me`（供「我的提报」页展示）；
 *  - `status` 均为 `'cancelled'`（归档），**绝不能是 `'pending'`**（否则污染待我审核列表）；
 *  - 二者均不出现在 `listPendingReview`。
 */
import { DEMO_USER_IDS, mockTasks, resetDatabase } from '@/data'
import { isSubmissionRecord } from '@/utils/submission'
import * as taskService from '@/services/task.service'

const ME = DEMO_USER_IDS.me

beforeEach(() => {
  resetDatabase()
})

describe('提报种子 task-022 / task-023 约束', () => {
  it('task-022（rejected）：createdBy=me、status=cancelled、submissionKind=project', () => {
    const task = mockTasks.find((t) => t.id === 'task-022')!
    expect(task).toBeDefined()
    expect(task.createdBy).toBe(ME)
    expect(task.status).toBe('cancelled')
    expect(task.status).not.toBe('pending')
    expect(task.submissionStatus).toBe('rejected')
    expect(task.submissionKind).toBe('project')
    expect(task.reviewNote).toBeTruthy()
    expect(isSubmissionRecord(task)).toBe(true)
  })

  it('task-023（approved）：createdBy=me、status=cancelled、submissionKind=task', () => {
    const task = mockTasks.find((t) => t.id === 'task-023')!
    expect(task).toBeDefined()
    expect(task.createdBy).toBe(ME)
    expect(task.status).toBe('cancelled')
    expect(task.status).not.toBe('pending')
    expect(task.submissionStatus).toBe('approved')
    expect(task.submissionKind).toBe('task')
    expect(isSubmissionRecord(task)).toBe(true)
  })

  it('两条种子记录均不污染「待我审核」列表', async () => {
    const pending = await taskService.listPendingReview(ME)
    expect(pending.some((t) => t.id === 'task-022')).toBe(false)
    expect(pending.some((t) => t.id === 'task-023')).toBe(false)
  })

  it('两条种子记录出现在「我的提报」列表（createdBy=me）', async () => {
    const mine = await taskService.listMySubmissions(ME)
    const ids = mine.map((t) => t.id)
    expect(ids).toContain('task-022')
    expect(ids).toContain('task-023')
  })
})
