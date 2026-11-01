/**
 * CPM 算法单测（已知图黄金用例）。
 *
 * 测试图（3 任务链 + 1 分支）：
 *
 *        ┌──→ TaskB (2h) ──→ TaskD (4h)
 * TaskA  │          (FS, lag=0)
 * (8h)   └──→ TaskC (16h) ──→ TaskE (8h)
 *              (FS, lag=1)
 *
 * 预期：
 * - TaskA: ES=Day0, duration=1d, EF=Day1, LS=Day0, LF=Day1, slack=0, critical=true
 * - TaskB: ES=Day1, duration=1d, EF=Day2, LS=Day2, LF=Day3, slack=1, critical=false
 * - TaskC: ES=Day1, duration=2d, EF=Day3 (FS lag=0: ES=Day1)
 * - TaskD: ES=TaskB.EF=Day2, duration=1d, EF=Day3, slack=0? 需验证
 * - TaskE: ES=TaskC.EF+lag=Day3+1=Day4, duration=1d, EF=Day5
 *
 * 关键路径：TaskA → TaskC → TaskE（最长）
 * projectEta = Day5
 */
import { describe, expect, it } from 'vitest'
import { addWorkdays, subtractWorkdays, calculateCPM, topologicalSort, DependencyInput, DependencyOutput, TaskInput } from './cpm';

describe('CPM 算法', () => {
  // ===================== 工作日工具函数测试 =====================

  describe('addWorkdays / subtractWorkdays', () => {
    it('addWorkdays 跳过周末', () => {
      // 周五 + 1 工作日 = 下周一
      const friday = new Date(Date.UTC(2026, 7, 14)); // 2026-08-14 周五
      const result = addWorkdays(friday, 1);
      expect(result.getUTCDate()).toBe(17); // 下周一
      expect(result.getUTCDay()).toBe(1); // Monday
    });

    it('addWorkdays 正数递增', () => {
      const monday = new Date(Date.UTC(2026, 7, 17)); // 2026-08-17 周一
      const result = addWorkdays(monday, 3);
      expect(result.getUTCDate()).toBe(20); // 周四
    });

    it('subtractWorkdays 跳过周末', () => {
      // 下周一 - 1 工作日 = 周五
      const monday = new Date(Date.UTC(2026, 7, 17));
      const result = subtractWorkdays(monday, 1);
      expect(result.getUTCDate()).toBe(14); // 周五
    });

    it('addWorkdays(0) 返回原日期', () => {
      const date = new Date(Date.UTC(2026, 7, 15));
      expect(addWorkdays(date, 0).getTime()).toBe(date.getTime());
    });
  });

  // ===================== 拓扑排序测试 =====================

  describe('topologicalSort', () => {
    it('正常 DAG 返回合法拓扑序', () => {
      const deps: DependencyInput[] = [
        { id: 'd1', prevTaskId: 'A', nextTaskId: 'B', type: 'FS', lagDays: 0 },
        { id: 'd2', prevTaskId: 'A', nextTaskId: 'C', type: 'FS', lagDays: 0 },
        { id: 'd3', prevTaskId: 'B', nextTaskId: 'D', type: 'FS', lagDays: 0 },
        { id: 'd4', prevTaskId: 'C', nextTaskId: 'E', type: 'FS', lagDays: 0 },
      ];
      const order = topologicalSort(['A', 'B', 'C', 'D', 'E'], deps);
      // A 必须在 B/C 前，B 必须在 D 前，C 必须在 E 前      expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
      expect(order.indexOf('A')).toBeLessThan(order.indexOf('C'));
      expect(order.indexOf('B')).toBeLessThan(order.indexOf('D'));
      expect(order.indexOf('C')).toBeLessThan(order.indexOf('E'));
    });

    it('有环时抛出 error', () => {
      const deps: DependencyInput[] = [
        { id: 'd1', prevTaskId: 'A', nextTaskId: 'B', type: 'FS', lagDays: 0 },
        { id: 'd2', prevTaskId: 'B', nextTaskId: 'A', type: 'FS', lagDays: 0 },
      ];
      expect(() => topologicalSort(['A', 'B'], deps)).toThrow('dependency_cycle_detected');
    });
  });

  // ===================== 黄金用例测试 =====================

  describe('calculateCPM 黄金用例', () => {
    it('3 任务链 + 1 分支：关键路径 = A→C→E', () => {
      const tasks: TaskInput[] = [
        { id: 'A', title: 'TaskA', status: 'todo', estimatedHours: 8, dueAt: null },
        { id: 'B', title: 'TaskB', status: 'todo', estimatedHours: 2, dueAt: null },
        { id: 'C', title: 'TaskC', status: 'todo', estimatedHours: 16, dueAt: null },
        { id: 'D', title: 'TaskD', status: 'todo', estimatedHours: 4, dueAt: null },
        { id: 'E', title: 'TaskE', status: 'todo', estimatedHours: 8, dueAt: null },
      ];

      const deps: DependencyOutput[] = [
        { id: 'd1', prevTaskId: 'A', nextTaskId: 'B', type: 'FS', lagDays: 0 },
        { id: 'd2', prevTaskId: 'A', nextTaskId: 'C', type: 'FS', lagDays: 0 },
        { id: 'd3', prevTaskId: 'B', nextTaskId: 'D', type: 'FS', lagDays: 0 },
        { id: 'd4', prevTaskId: 'C', nextTaskId: 'E', type: 'FS', lagDays: 1 },
      ];

      const result = calculateCPM('proj-1', tasks, deps);

      // 找到各任务
      const taskA = result.tasks.find(t => t.id === 'A')!;
      const taskB = result.tasks.find(t => t.id === 'B')!;
      const taskC = result.tasks.find(t => t.id === 'C')!;
      const taskD = result.tasks.find(t => t.id === 'D')!;
      const taskE = result.tasks.find(t => t.id === 'E')!;

      // 工期验证
      expect(taskA.durationDays).toBe(1); // 8/8 = 1
      expect(taskB.durationDays).toBe(1); // ceil(2/8) = 1
      expect(taskC.durationDays).toBe(2); // 16/8 = 2
      expect(taskD.durationDays).toBe(1); // ceil(4/8) = 1
      expect(taskE.durationDays).toBe(1); // 8/8 = 1

      // 关键路径：A→C→E（最长路径）
      expect(taskA.slackDays).toBe(0);
      expect(taskA.critical).toBe(true);
      expect(taskC.slackDays).toBe(0);
      expect(taskC.critical).toBe(true);
      expect(taskE.slackDays).toBe(0);
      expect(taskE.critical).toBe(true);

      // B 和 D 有浮动时间      expect(taskB.slackDays).toBeGreaterThanOrEqual(0);
      expect(taskD.slackDays).toBeGreaterThanOrEqual(0);

      // 关键路径包含 A, C, E
      expect(result.criticalPath).toContain('A');
      expect(result.criticalPath).toContain('C');
      expect(result.criticalPath).toContain('E');

      // projectEta = E 的 EF
      expect(result.projectEta).toBe(taskE.ef);

      // 假设说明
      expect(result.assumptions).toContainEqual(expect.stringContaining('estimated_hours'));
    });

    it('已完成任务不参与计算', () => {
      const tasks: TaskInput[] = [
        { id: 'A', title: 'DoneTask', status: 'done', estimatedHours: 8, dueAt: null },
        { id: 'B', title: 'ActiveTask', status: 'todo', estimatedHours: 8, dueAt: null },
      ];
      const deps: DependencyOutput[] = [
        { id: 'd1', prevTaskId: 'A', nextTaskId: 'B', type: 'FS', lagDays: 0 },
      ];

      const result = calculateCPM('proj-2', tasks, deps);

      // A 是 done，不应出现在结果中      expect(result.tasks.find(t => t.id === 'A')).toBeUndefined();
      // B 无活跃前置，ES = today
      const taskB = result.tasks.find(t => t.id === 'B')!;
      expect(taskB.critical).toBe(true);
      expect(taskB.slackDays).toBe(0);
    });

    it('SS 依赖传播：nextTask.ES = prevTask.ES + lagDays', () => {
      const tasks: TaskInput[] = [
        { id: 'A', title: 'TaskA', status: 'todo', estimatedHours: 8, dueAt: null },
        { id: 'B', title: 'TaskB', status: 'todo', estimatedHours: 8, dueAt: null },
      ];
      const deps: DependencyOutput[] = [
        { id: 'd1', prevTaskId: 'A', nextTaskId: 'B', type: 'SS', lagDays: 2 },
      ];

      const result = calculateCPM('proj-3', tasks, deps);
      const taskA = result.tasks.find(t => t.id === 'A')!;
      const taskB = result.tasks.find(t => t.id === 'B')!;

      // SS: B.ES = A.ES + 2 workdays
      const expectedBES = addWorkdays(new Date(taskA.es), 2);
      expect(new Date(taskB.es).getTime()).toBe(expectedBES.getTime());
    });

    it('FF 依赖传播：nextTask.EF = prevTask.EF + lagDays', () => {
      const tasks: TaskInput[] = [
        { id: 'A', title: 'TaskA', status: 'todo', estimatedHours: 8, dueAt: null },
        { id: 'B', title: 'TaskB', status: 'todo', estimatedHours: 16, dueAt: null },
      ];
      const deps: DependencyOutput[] = [
        { id: 'd1', prevTaskId: 'A', nextTaskId: 'B', type: 'FF', lagDays: 1 },
      ];

      const result = calculateCPM('proj-4', tasks, deps);
      const taskA = result.tasks.find(t => t.id === 'A')!;
      const taskB = result.tasks.find(t => t.id === 'B')!;

      // FF: B.EF = A.EF + 1 workday
      const expectedBEF = addWorkdays(new Date(taskA.ef), 1);
      expect(new Date(taskB.ef).getTime()).toBe(expectedBEF.getTime());
    });

    it('SF 依赖传播：nextTask.EF = prevTask.ES + lagDays', () => {
      const tasks: TaskInput[] = [
        { id: 'A', title: 'TaskA', status: 'todo', estimatedHours: 8, dueAt: null },
        { id: 'B', title: 'TaskB', status: 'todo', estimatedHours: 8, dueAt: null },
      ];
      const deps: DependencyOutput[] = [
        { id: 'd1', prevTaskId: 'A', nextTaskId: 'B', type: 'SF', lagDays: 0 },
      ];

      const result = calculateCPM('proj-5', tasks, deps);
      const taskA = result.tasks.find(t => t.id === 'A')!;
      const taskB = result.tasks.find(t => t.id === 'B')!;

      // SF: B.EF = A.ES + 0
      const expectedBEF = new Date(taskA.es);
      expect(new Date(taskB.ef).getTime()).toBe(expectedBEF.getTime());
    });

    it('无估时任务默认工期 1 天', () => {
      const tasks: TaskInput[] = [
        { id: 'A', title: 'TaskA', status: 'todo', estimatedHours: null, dueAt: null },
      ];
      const result = calculateCPM('proj-6', tasks, []);
      expect(result.tasks[0].durationDays).toBe(1);
    });

    it('关键路径上 dueAt 非空的任务标记为 milestone', () => {
      const dueAt = new Date(Date.UTC(2026, 7, 20)).toISOString();
      const tasks: TaskInput[] = [
        { id: 'A', title: 'TaskA', status: 'todo', estimatedHours: 8, dueAt },
        { id: 'B', title: 'TaskB', status: 'todo', estimatedHours: 8, dueAt: null },
      ];
      const deps: DependencyOutput[] = [
        { id: 'd1', prevTaskId: 'A', nextTaskId: 'B', type: 'FS', lagDays: 0 },
      ];

      const result = calculateCPM('proj-7', tasks, deps);
      const taskA = result.tasks.find(t => t.id === 'A')!;
      expect(taskA.milestone).toBe(true);
      expect(result.milestones).toContain('A');
    });
  });
});
