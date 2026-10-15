/**
 * 职责：个人计划域 service 测试（M2-P0-06 / M2-P1-01 / M2-P1-04）。
 *
 * 覆盖既有测试未触达的写方法：
 * - `listPersonalTasks`（仅返回本人任务）；
 * - `createPersonalTask`（落库 / sortOrder / dueAt 同步）；
 * - `updatePersonalTask`（部分字段 / 状态迁移副作用）；
 * - `completePersonalTask`（完成副作用）；
 * - `deletePersonalTask`（删除 / 不存在抛 40401）；
 * - `schedulePersonalTask`（拖拽与点击改期共用的落库方法，startAt/endAt/dueAt 同步）。
 *
 * 纯 service 层测试（USE_MOCK），不依赖 RN 原生模块；每个用例前 resetDatabase 保证幂等。
 */
import { DEMO_USER_IDS, db, resetDatabase } from '@/data'
import * as focusService from '@/services/focus.service'

const ME = DEMO_USER_IDS.me // user-001
const LINA = DEMO_USER_IDS.lina // user-002（member）

beforeEach(() => {
  resetDatabase()
})

describe('listPersonalTasks —— 仅返回本人任务', () => {
  it('返回种子中的 3 条本人任务，且 userId 均为本人', async () => {
    const list = await focusService.listPersonalTasks(ME)
    expect(list).toHaveLength(3)
    list.forEach((task) => expect(task.userId).toBe(ME))
    // 按 sortOrder 升序
    expect(list.map((t) => t.sortOrder)).toEqual([1, 2, 3])
  })

  it('他人 userId 返回空列表（个人计划相互隔离）', async () => {
    expect(await focusService.listPersonalTasks(LINA)).toEqual([])
  })
})

describe('createPersonalTask —— 新建落库', () => {
  it('返回 todo 结构、dueAt 同步为 endAt、sortOrder 递增，且列表可见', async () => {
    const startAt = new Date(Date.now() + 3600_000).toISOString()
    const endAt = new Date(Date.now() + 7200_000).toISOString()
    const created = await focusService.createPersonalTask(ME, {
      title: '新建个人任务',
      description: '说明',
      priority: 'high',
      startAt,
      endAt,
    })

    expect(created.userId).toBe(ME)
    expect(created.title).toBe('新建个人任务')
    expect(created.priority).toBe('high')
    expect(created.status).toBe('todo')
    expect(created.startAt).toBe(startAt)
    expect(created.endAt).toBe(endAt)
    expect(created.dueAt).toBe(endAt) // dueAt 与 endAt 同步
    expect(created.completedAt).toBeNull()
    expect(created.sortOrder).toBe(4) // 既有 3 条 + 1

    const list = await focusService.listPersonalTasks(ME)
    expect(list.some((t) => t.id === created.id)).toBe(true)
    expect(list).toHaveLength(4)
  })
})

describe('updatePersonalTask —— 部分字段更新', () => {
  it('仅更新标题与优先级，其余字段不动', async () => {
    const before = db.personalTasks.find((t) => t.id === 'personal-002')!
    const updated = await focusService.updatePersonalTask('personal-002', {
      title: '改名后',
      priority: 'urgent',
    })
    expect(updated.title).toBe('改名后')
    expect(updated.priority).toBe('urgent')
    expect(updated.startAt).toBe(before.startAt)
    expect(updated.status).toBe('todo')
  })

  it('更新 endAt 时同步 dueAt', async () => {
    const endAt = new Date(Date.now() + 3 * 3600_000).toISOString()
    const updated = await focusService.updatePersonalTask('personal-002', { endAt })
    expect(updated.endAt).toBe(endAt)
    expect(updated.dueAt).toBe(endAt)
  })

  it('状态置 done 落 completedAt 与 actualHours；置回 todo 清空 completedAt', async () => {
    const done = await focusService.updatePersonalTask('personal-002', { status: 'done' })
    expect(done.status).toBe('done')
    expect(done.completedAt).not.toBeNull()
    expect(done.actualHours).toBe(1) // 回落 estimatedHours

    const reopened = await focusService.updatePersonalTask('personal-002', { status: 'todo' })
    expect(reopened.status).toBe('todo')
    expect(reopened.completedAt).toBeNull()
  })

  it('不存在的 id 抛 40401', async () => {
    await expect(
      focusService.updatePersonalTask('personal-999', { title: 'x' }),
    ).rejects.toMatchObject({ code: 40401 })
  })
})

describe('completePersonalTask —— 标记完成', () => {
  it('状态置 done 且落 completedAt / actualHours', async () => {
    const done = await focusService.completePersonalTask('personal-002')
    expect(done.status).toBe('done')
    expect(done.completedAt).not.toBeNull()
    expect(done.actualHours).toBe(1)
  })

  it('不存在的 id 抛 40401', async () => {
    await expect(focusService.completePersonalTask('personal-999')).rejects.toMatchObject({
      code: 40401,
    })
  })
})

describe('deletePersonalTask —— 删除', () => {
  it('删除后列表中不再出现', async () => {
    await focusService.deletePersonalTask('personal-003')
    const list = await focusService.listPersonalTasks(ME)
    expect(list.some((t) => t.id === 'personal-003')).toBe(false)
    expect(list).toHaveLength(2)
  })

  it('删除不存在的 id 抛 40401', async () => {
    await expect(focusService.deletePersonalTask('personal-999')).rejects.toMatchObject({
      code: 40401,
    })
  })
})

describe('schedulePersonalTask —— 排期改期（拖拽 / 点击共用）', () => {
  it('落库 startAt / endAt，并同步 dueAt', async () => {
    const startAt = new Date(Date.now() + 3600_000).toISOString()
    const endAt = new Date(Date.now() + 5400_000).toISOString()
    const scheduled = await focusService.schedulePersonalTask('personal-002', { startAt, endAt })
    expect(scheduled.startAt).toBe(startAt)
    expect(scheduled.endAt).toBe(endAt)
    expect(scheduled.dueAt).toBe(endAt)

    // 回读一致（内存库已落库）
    const persisted = db.personalTasks.find((t) => t.id === 'personal-002')!
    expect(persisted.startAt).toBe(startAt)
    expect(persisted.endAt).toBe(endAt)
  })

  it('时长保持恒定（endAt − startAt 与入参一致）', async () => {
    const startAt = '2026-09-27T01:00:00.000Z'
    const endAt = '2026-09-27T02:30:00.000Z'
    const scheduled = await focusService.schedulePersonalTask('personal-001', { startAt, endAt })
    const durationMin = (new Date(scheduled.endAt!).getTime() - new Date(scheduled.startAt!).getTime()) / 60_000
    expect(durationMin).toBe(90)
  })

  it('不存在的 id 抛 40401', async () => {
    const startAt = new Date().toISOString()
    await expect(
      focusService.schedulePersonalTask('personal-999', { startAt, endAt: startAt }),
    ).rejects.toMatchObject({ code: 40401 })
  })
})
