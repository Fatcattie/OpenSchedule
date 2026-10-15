/**
 * 职责：任务状态机 TASK_TRANSITIONS 单元测试 —— 合法 / 非法迁移（含 done → cancelled 非法等边界）。
 * 依据 PRD M-P0-10 与 ARCH §4（TASK_TRANSITIONS 前端预渲染，后端为权威）。
 */
import {
  BOARD_COLUMNS,
  REASON_MIN_LENGTH,
  TASK_TRANSITION_ACTIONS,
  TASK_TRANSITIONS,
  type TaskStatus,
} from '@/types'

/** 迁移是否合法 */
function isLegal(from: TaskStatus, to: TaskStatus): boolean {
  return (TASK_TRANSITIONS[from] ?? []).includes(to)
}

const ALL_STATUSES: TaskStatus[] = [
  'todo',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
  'pending_review',
]

describe('TASK_TRANSITIONS —— 合法迁移', () => {
  it('todo → in_progress / blocked / cancelled', () => {
    expect(isLegal('todo', 'in_progress')).toBe(true)
    expect(isLegal('todo', 'blocked')).toBe(true)
    expect(isLegal('todo', 'cancelled')).toBe(true)
  })

  it('in_progress → todo / done / blocked / cancelled', () => {
    expect(isLegal('in_progress', 'todo')).toBe(true)
    expect(isLegal('in_progress', 'done')).toBe(true)
    expect(isLegal('in_progress', 'blocked')).toBe(true)
    expect(isLegal('in_progress', 'cancelled')).toBe(true)
  })

  it('blocked → in_progress / done / cancelled', () => {
    expect(isLegal('blocked', 'in_progress')).toBe(true)
    expect(isLegal('blocked', 'done')).toBe(true)
    expect(isLegal('blocked', 'cancelled')).toBe(true)
  })

  it('done → todo / in_progress（重开）', () => {
    expect(isLegal('done', 'todo')).toBe(true)
    expect(isLegal('done', 'in_progress')).toBe(true)
  })

  it('cancelled 为终态，无出边', () => {
    expect(TASK_TRANSITIONS.cancelled).toEqual([])
  })
})

describe('TASK_TRANSITIONS —— 非法迁移边界', () => {
  it('done → cancelled 非法（已完成后不可取消）', () => {
    expect(isLegal('done', 'cancelled')).toBe(false)
  })

  it('done → blocked 非法', () => {
    expect(isLegal('done', 'blocked')).toBe(false)
  })

  it('todo → done 非法（须先开始/阻塞）', () => {
    expect(isLegal('todo', 'done')).toBe(false)
  })

  it('cancelled → 任意状态非法', () => {
    ALL_STATUSES.forEach((to) => {
      expect(isLegal('cancelled', to)).toBe(false)
    })
  })

  it('自迁移（X → X）全部非法', () => {
    ALL_STATUSES.forEach((status) => {
      expect(isLegal(status, status)).toBe(false)
    })
  })

  it('迁移表覆盖全部 6 种状态', () => {
    expect(Object.keys(TASK_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort())
  })
})

describe('TASK_TRANSITION_ACTIONS —— 与状态机同源一致', () => {
  it('每个动作目标均在合法迁移集合内', () => {
    ALL_STATUSES.forEach((from) => {
      ;(TASK_TRANSITION_ACTIONS[from] ?? []).forEach((action) => {
        expect(TASK_TRANSITIONS[from]).toContain(action.to)
      })
    })
  })

  it('每条合法迁移都有对应可点动作（无遗漏）', () => {
    // 增量 7：`pending_review` 及其相关边**刻意不暴露**通用 UI 动作（审批 / 提报走审核中心专用入口，
    // 见 ARCH §2.2），故反向「无遗漏」断言限定为**不含 pending_review 的迁移**。
    ALL_STATUSES.forEach((from) => {
      if (from === 'pending_review') return
      const actionTargets = (TASK_TRANSITION_ACTIONS[from] ?? []).map((action) => action.to)
      TASK_TRANSITIONS[from].forEach((to) => {
        if (to === 'pending_review') return
        expect(actionTargets).toContain(to)
      })
    })
  })

  it('阻塞 / 取消 / 重开要求填原因（requireReason）', () => {
    const blocked = TASK_TRANSITION_ACTIONS.todo.find((a) => a.to === 'blocked')
    const cancelled = TASK_TRANSITION_ACTIONS.in_progress.find((a) => a.to === 'cancelled')
    const reopen = TASK_TRANSITION_ACTIONS.done.find((a) => a.to === 'todo')
    expect(blocked?.requireReason).toBe(true)
    expect(cancelled?.requireReason).toBe(true)
    expect(reopen?.requireReason).toBe(true)
  })

  it('完成动作要求填实际工时（requireActualHours）', () => {
    const done = TASK_TRANSITION_ACTIONS.in_progress.find((a) => a.to === 'done')
    expect(done?.requireActualHours).toBe(true)
  })

  it('cancelled 无可用动作', () => {
    expect(TASK_TRANSITION_ACTIONS.cancelled).toEqual([])
  })
})

describe('常量与看板列', () => {
  it('原因最小长度 = 4', () => {
    expect(REASON_MIN_LENGTH).toBe(4)
  })

  it('看板默认五列且顺序为 todo/in_progress/blocked/pending_review/done', () => {
    expect(BOARD_COLUMNS.map((c) => c.status)).toEqual([
      'todo',
      'in_progress',
      'blocked',
      'pending_review',
      'done',
    ])
  })
})
