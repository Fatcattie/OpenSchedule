/**
 * emergency-engine.spec.ts —— 临期应急建议引擎单测
 */
import { generateEmergencySuggestions } from './emergency-engine'

function makeTask(overrides: Partial<any> = {}) {
  return {
    id: overrides.id ?? 't1',
    title: overrides.title ?? '任务',
    status: overrides.status ?? 'in_progress',
    progress: overrides.progress ?? 50,
    estimatedHours: overrides.estimatedHours ?? 8,
    dueDate: overrides.dueDate,
    assigneeId: overrides.assigneeId ?? 'u1',
    priority: overrides.priority ?? 'medium',
    ...overrides,
  }
}

describe('emergency-engine', () => {
  const now = new Date('2026-08-15T12:00:00Z')

  // ========= 规则 1：加班冲刺 =========
  it('临期且剩余工时少 → 触发冲刺建议', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'in_progress', progress: 70, estimatedHours: 8, dueDate: new Date('2026-08-17') }),
    ]
    const result = generateEmergencySuggestions({ projectId: 'p1', tasks, now })
    const rush = result.actions.find(a => a.id === 'action-rush')
    expect(rush).toBeDefined()
    expect(rush?.targetTaskIds).toContain('t1')
  })

  it('距到期还有一周 → 不触发冲刺', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'in_progress', progress: 20, estimatedHours: 8, dueDate: new Date('2026-08-22') }),
    ]
    const result = generateEmergencySuggestions({ projectId: 'p1', tasks, now })
    const rush = result.actions.find(a => a.id === 'action-rush')
    expect(rush).toBeUndefined()
  })

  // ========= 规则 2：阻塞解除 =========
  it('有阻塞任务且有下游 → 触发解除阻塞建议', () => {
    const tasks = [
      makeTask({ id: 'blocked', status: 'blocked', progress: 0, title: '关键任务A' }),
      makeTask({ id: 'down1', status: 'todo', progress: 0 }),
      makeTask({ id: 'down2', status: 'todo', progress: 0 }),
      makeTask({ id: 'down3', status: 'todo', progress: 0 }),
    ]
    const dependencies = [
      { id: 'd1', fromTaskId: 'blocked', toTaskId: 'down1', type: 'FS' },
      { id: 'd2', fromTaskId: 'down1', toTaskId: 'down2', type: 'FS' },
      { id: 'd3', fromTaskId: 'down2', toTaskId: 'down3', type: 'FS' },
    ]
    const result = generateEmergencySuggestions({ projectId: 'p1', tasks, dependencies, now })
    const unblock = result.actions.find(a => a.id === 'action-unblock')
    expect(unblock).toBeDefined()
    expect(unblock?.targetTaskIds[0]).toBe('blocked')
  })

  it('无阻塞任务 → 不触发解除阻塞', () => {
    const tasks = [makeTask({ id: 't1' })]
    const result = generateEmergencySuggestions({ projectId: 'p1', tasks, now })
    const unblock = result.actions.find(a => a.id === 'action-unblock')
    expect(unblock).toBeUndefined()
  })

  // ========= 规则 3：负载均衡 =========
  it('有人过载有人闲置 → 触发重新分配', () => {
    const tasks = []
    for (let i = 0; i < 7; i++) {
      tasks.push(makeTask({ id: `o${i}`, status: 'in_progress', assigneeId: 'overloaded' }))
    }
    tasks.push(makeTask({ id: 'idle1', status: 'todo', assigneeId: 'idle' }))

    const memberLoads = [
      { assigneeId: 'overloaded', inProgressCount: 7, totalHours: 56 },
      { assigneeId: 'idle', inProgressCount: 0, totalHours: 0 },
    ]
    const result = generateEmergencySuggestions({ projectId: 'p1', tasks, memberLoads, now })
    const rebalance = result.actions.find(a => a.id === 'action-rebalance')
    expect(rebalance).toBeDefined()
  })

  it('全员负载均衡 → 不触发重新分配', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'in_progress', assigneeId: 'u1' }),
      makeTask({ id: 't2', status: 'in_progress', assigneeId: 'u2' }),
    ]
    const memberLoads = [
      { assigneeId: 'u1', inProgressCount: 3, totalHours: 24 },
      { assigneeId: 'u2', inProgressCount: 3, totalHours: 24 },
    ]
    const result = generateEmergencySuggestions({ projectId: 'p1', tasks, memberLoads, now })
    const rebalance = result.actions.find(a => a.id === 'action-rebalance')
    expect(rebalance).toBeUndefined()
  })

  // ========= 规则 4：优先级重排 =========
  it('多个高优临期 + 有低优 → 触发优先级重排', () => {
    const tasks = []
    for (let i = 0; i < 4; i++) {
      tasks.push(makeTask({
        id: `h${i}`,
        status: 'todo',
        progress: 0,
        priority: 'high',
        dueDate: new Date('2026-08-17'),
      }))
    }
    for (let i = 0; i < 3; i++) {
      tasks.push(makeTask({ id: `l${i}`, status: 'todo', progress: 0, priority: 'low' }))
    }
    const result = generateEmergencySuggestions({ projectId: 'p1', tasks, now })
    const reprioritize = result.actions.find(a => a.id === 'action-reprioritize')
    expect(reprioritize).toBeDefined()
  })

  it('高优任务不多 → 不触发优先级重排', () => {
    const tasks = [
      makeTask({ id: 'h1', status: 'todo', progress: 0, priority: 'high', dueDate: new Date('2026-08-17') }),
      makeTask({ id: 'l1', status: 'todo', progress: 0, priority: 'low' }),
    ]
    const result = generateEmergencySuggestions({ projectId: 'p1', tasks, now })
    const reprioritize = result.actions.find(a => a.id === 'action-reprioritize')
    expect(reprioritize).toBeUndefined()
  })

  // ========= 规则 5：冻结范围 =========
  it('高取消率 → 触发冻结范围', () => {
    const tasks = []
    for (let i = 0; i < 5; i++) {
      tasks.push(makeTask({ id: `c${i}`, status: 'cancelled' }))
    }
    for (let i = 0; i < 10; i++) {
      tasks.push(makeTask({ id: `a${i}`, status: 'in_progress' }))
    }
    const result = generateEmergencySuggestions({ projectId: 'p1', tasks, now })
    const freeze = result.actions.find(a => a.id === 'action-freeze-scope')
    expect(freeze).toBeDefined()
  })

  it('取消率低 → 不触发冻结范围', () => {
    const tasks = [
      makeTask({ id: 'c1', status: 'cancelled' }),
      makeTask({ id: 't1', status: 'in_progress' }),
      makeTask({ id: 't2', status: 'done' }),
    ]
    const result = generateEmergencySuggestions({ projectId: 'p1', tasks, now })
    const freeze = result.actions.find(a => a.id === 'action-freeze-scope')
    expect(freeze).toBeUndefined()
  })

  // ========= 综合 =========
  it('多规则同时触发 → 多条建议', () => {
    const tasks = [
      // 临期冲刺
      makeTask({ id: 'rush1', status: 'in_progress', progress: 80, estimatedHours: 8, dueDate: new Date('2026-08-16'), assigneeId: 'u1' }),
      // 阻塞
      makeTask({ id: 'blocked1', status: 'blocked', progress: 0, assigneeId: 'u2' }),
      makeTask({ id: 'down1', status: 'todo', progress: 0, assigneeId: 'u2' }),
      // 高优临期
      makeTask({ id: 'h1', status: 'todo', progress: 0, priority: 'high', dueDate: new Date('2026-08-17') }),
      makeTask({ id: 'h2', status: 'todo', progress: 0, priority: 'high', dueDate: new Date('2026-08-17') }),
      makeTask({ id: 'h3', status: 'todo', progress: 0, priority: 'high', dueDate: new Date('2026-08-17') }),
      makeTask({ id: 'low1', status: 'todo', progress: 0, priority: 'low' }),
    ]
    const dependencies = [
      { id: 'd1', fromTaskId: 'blocked1', toTaskId: 'down1', type: 'FS' },
    ]
    const result = generateEmergencySuggestions({ projectId: 'p1', tasks, dependencies, now })
    expect(result.actions.length).toBeGreaterThanOrEqual(2)
    expect(result.summary).toContain('应急措施')
  })

  it('健康项目 → 空建议', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'done', progress: 100 }),
      makeTask({ id: 't2', status: 'in_progress', progress: 60, dueDate: new Date('2026-08-30') }),
    ]
    const result = generateEmergencySuggestions({ projectId: 'p1', tasks, now })
    expect(result.actions.length).toBe(0)
    expect(result.summary).toContain('可控')
  })

  it('风险预估：应用后分数下降', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'blocked', progress: 0, estimatedHours: 8, dueDate: new Date('2026-08-10') }),
      makeTask({ id: 't2', status: 'in_progress', progress: 70, estimatedHours: 8, dueDate: new Date('2026-08-17') }),
    ]
    const result = generateEmergencySuggestions({ projectId: 'p1', tasks, now })
    expect(result.riskScoreBefore).toBeGreaterThan(0)
    expect(result.riskScoreAfterEstimate).toBeLessThanOrEqual(result.riskScoreBefore)
  })
})