/**
 * 职责：看板数据 store（Zustand）—— 任务集合 + 乐观更新（占位）；WS 实时推送接入点（规格 3.6 事件房间广播）
 */
import { create } from 'zustand'
import type { Task, TaskStatus } from '@/types'

interface BoardState {
  /** 当前看板的任务集合（与 TanStack Query 缓存保持同步） */
  tasks: Task[]
  setTasks: (tasks: Task[]) => void
  /** 单任务插入/更新 */
  upsertTask: (task: Task) => void
  /**
   * 乐观移动：立即更新本地状态，返回 rollback 供失败回滚
   * TODO(后端接入): 成功后以服务端返回的 task 校准（version/sortOrder）；失败调用 rollback 并提示
   * TODO(WS): 订阅项目房间 task.* 事件后，此处可被实时事件覆盖（规格 3.6）
   */
  moveTaskOptimistic: (taskId: string, toStatus: TaskStatus, sortOrder?: number) => { rollback: () => void }
}

export const useBoardStore = create<BoardState>()((set, get) => ({
  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  upsertTask: (task) =>
    set((state) => ({
      tasks: state.tasks.some((t) => t.id === task.id)
        ? state.tasks.map((t) => (t.id === task.id ? task : t))
        : [...state.tasks, task],
    })),
  moveTaskOptimistic: (taskId, toStatus, sortOrder) => {
    const prev = get().tasks
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? { ...t, status: toStatus, sortOrder: sortOrder ?? t.sortOrder, version: t.version + 1 }
          : t,
      ),
    }))
    return { rollback: () => set({ tasks: prev }) }
  },
}))
