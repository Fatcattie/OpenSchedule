/**
 * CPM（关键路径法）纯函数算法，不依赖 Prisma / NestJS。
 * 输入：项目内活跃任务列表 + 依赖列表；输出：ES/EF/LS/LF/slack/criticalPath/milestones/eta。
 *
 * 约定：
 * - durationDays = estimatedHours / 8，无估时默认 1 天
 * - 起点：无前置依赖的活跃任务 ES = today 00:00 UTC
 * - 依赖传播：
 *   - FS：nextTask.ES = prevTask.EF + lagDays（工作日）
 *   - SS：nextTask.ES = prevTask.ES + lagDays（工作日）
 *   - FF：nextTask.EF = prevTask.EF + lagDays（工作日）
 *   - SF：nextTask.EF = prevTask.ES + lagDays（工作日）
 * - 已完成（done）/已取消（cancelled）任务不参与计算
 * - 周末顺延使用 addWorkdays 函数
 * - 关键路径 = slackDays === 0 的任务链
 * - milestone = 关键路径上 dueAt 非空的任务，或 durationDays === 0 的任务
 */

export interface TaskInput {
  id: string;
  title: string;
  status: string; // TODO/IN_PROGRESS/DONE/CANCELLED/BLOCKED
  estimatedHours: number | null;
  dueAt: string | null; // ISO 8601 or null
}

export interface DependencyInput {
  id: string;
  prevTaskId: string;
  nextTaskId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: number;
}

export interface PlanTask {
  id: string;
  title: string;
  status: string;
  durationDays: number;
  es: string; // ISO 8601
  ef: string; // ISO 8601
  ls: string; // ISO 8601
  lf: string; // ISO 8601
  slackDays: number;
  critical: boolean;
  milestone: boolean;
  eta: string; // ISO 8601 (= EF)
  dueAt: string | null;
}

export interface PlanResult {
  projectId: string;
  calculatedAt: string;
  tasks: PlanTask[];
  criticalPath: string[];
  projectEta: string; // ISO 8601
  projectSlackDays: number;
  milestones: string[];
  assumptions: string[];
}

export interface DependencyOutput {
  id: string;
  prevTaskId: string;
  nextTaskId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: number;
}

/**
 * 在工作日上加 n 天（跳过周六日）。
 * start 为 ES（00:00 UTC），返回结果也为 00:00 UTC。
 */
export function addWorkdays(start: Date, days: number): Date {
  if (days <= 0) return new Date(start);
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setTime(result.getTime() + 86400000);
    const dow = result.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      added++;
    }
  }
  return result;
}

/**
 * 在工作日上减 n 天（跳过周六日）。
 */
export function subtractWorkdays(start: Date, days: number): Date {
  if (days <= 0) return new Date(start);
  const result = new Date(start);
  let sub = 0;
  while (sub < days) {
    result.setTime(result.getTime() - 86400000);
    const dow = result.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      sub++;
    }
  }
  return result;
}

/** 将计划起点归一到工作日，避免周末起点与反向工作日计算不对称。 */
function normalizeToWorkday(date: Date): Date {
  const result = new Date(date);
  const dow = result.getUTCDay();
  if (dow === 6) result.setUTCDate(result.getUTCDate() + 2);
  if (dow === 0) result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

/**
 * 拓扑排序（Kahn 算法），检测环。
 * @returns 拓扑顺序的任务 ID 数组；有环抛 Error
 */
export function topologicalSort(taskIds: string[], deps: DependencyInput[]): string[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of taskIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const d of deps) {
    const prevId = d.prevTaskId;
    const nextId = d.nextTaskId;
    if (!inDegree.has(prevId) || !inDegree.has(nextId)) continue;
    adj.get(prevId)!.push(nextId);
    inDegree.set(nextId, (inDegree.get(nextId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      const newDeg = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (order.length !== taskIds.length) {
    throw new Error('dependency_cycle_detected');
  }
  return order;
}

/**
 * 主 CPM 计算入口。
 * @param projectId 项目 ID
 * @param tasks 活跃任务列表（已过滤 done/cancelled）
 * @param dependencies 依赖列表（仅活跃任务间的依赖）
 * @returns PlanResult
 */
export function calculateCPM(projectId: string, tasks: TaskInput[], dependencies: DependencyOutput[], explicitStartDate?: Date): PlanResult {
  const now = new Date();
  const todayUTC = explicitStartDate
    ? new Date(explicitStartDate)
    : normalizeToWorkday(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));

  // 过滤活跃任务（status not in DONE/CANCELLED）
  const activeStatuses = new Set(['todo', 'in_progress', 'blocked']);
  const activeTasks = tasks.filter(t => activeStatuses.has(t.status.toLowerCase()));

  // 构建任务 map
  const taskMap = new Map<string, TaskInput>();
  for (const t of activeTasks) {
    taskMap.set(t.id, t);
  }

  // 过滤依赖（两端都是活跃任务）
  const validDeps = dependencies.filter(d => taskMap.has(d.prevTaskId) && taskMap.has(d.nextTaskId));

  // 拓扑排序
  const taskIds = activeTasks.map(t => t.id);
  const sortedOrder = topologicalSort(taskIds, validDeps as DependencyInput[]);

  // ========== 正向遍历：计算 ES/EF ==========
  const esMap = new Map<string, Date>();
  const efMap = new Map<string, Date>();

  for (const id of sortedOrder) {
    const task = taskMap.get(id)!;
    // 找所有前置依赖
    const prevDeps = validDeps.filter(d => d.nextTaskId === id);

    if (prevDeps.length === 0) {
      // 无前置：起点 = today
      esMap.set(id, new Date(todayUTC));
    } else {
      // 根据依赖类型计算 ES：取所有约束的 max（ earliest = max of all constraint-derived ES）
      // 初始化为 epoch（极早日期），确保任何约束都能覆盖
      let earliestES = new Date(0);
      for (const dep of prevDeps) {
        const prevEF = efMap.get(dep.prevTaskId)!;
        const prevES = esMap.get(dep.prevTaskId)!;

        let candidateES: Date;
        switch (dep.type) {
          case 'FS':
            // FS: nextTask.ES = prevTask.EF + lagDays
            candidateES = addWorkdays(prevEF, dep.lagDays);
            break;
          case 'SS':
            // SS: nextTask.ES = prevTask.ES + lagDays
            candidateES = addWorkdays(prevES, dep.lagDays);
            break;
          case 'FF':
            // FF: nextTask.EF = prevTask.EF + lagDays；约束 EF，不约束 ES，跳过
            continue;
          case 'SF':
            // SF: nextTask.EF = prevTask.ES + lagDays；约束 EF，不约束 ES，跳过
            continue;
          default:
            candidateES = addWorkdays(prevEF, dep.lagDays);
        }
        if (candidateES > earliestES) {
          earliestES = candidateES;
        }
      }
      // 确保不早于 today（除非有显式约束）
      esMap.set(id, earliestES.getTime() > 0 ? earliestES : new Date(todayUTC));
    }

    // 计算 durationDays
    const durationDays = task.estimatedHours != null && task.estimatedHours > 0
      ? Math.ceil(task.estimatedHours / 8)
      : 1;

    // EF = ES + (durationDays - 1)：工期为 N 个工作日时，EF = ES + N-1 个工作日
    // 例如：1 天工期 → ES == EF（当天开始当天结束）；2 天工期 → EF = ES + 1 工作日
    const ef = addWorkdays(esMap.get(id)!, Math.max(0, durationDays - 1));
    efMap.set(id, ef);
  }

  // ========== 处理 FF/SF 约束（二次遍历）==========
  // FF: nextTask.EF >= prevTask.EF + lagDays
  // SF: nextTask.EF >= prevTask.ES + lagDays
  // 多次迭代直到稳定（有向无环图保证收敛）
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 100) {
    changed = false;
    iterations++;
    for (const id of sortedOrder) {
      const prevDeps = validDeps.filter(d => d.nextTaskId === id);
      for (const dep of prevDeps) {
        const prevEF = efMap.get(dep.prevTaskId)!;
        const prevES = esMap.get(dep.prevTaskId)!;
        let constraintEF: Date;
        switch (dep.type) {
          case 'FF':
            constraintEF = addWorkdays(prevEF, dep.lagDays);
            break;
          case 'SF':
            constraintEF = addWorkdays(prevES, dep.lagDays);
            break;
          default:
            continue;
        }
        const currentEF = efMap.get(id)!;
        if (constraintEF > currentEF) {
          efMap.set(id, constraintEF);
          // EF 抬高后同步抬高 ES，保持 EF = ES + dur - 1 关系
          const task = taskMap.get(id)!;
          const dur = task.estimatedHours != null && task.estimatedHours > 0
            ? Math.ceil(task.estimatedHours / 8)
            : 1;
          const newES = subtractWorkdays(constraintEF, Math.max(0, dur - 1));
          if (newES > esMap.get(id)!) {
            esMap.set(id, newES);
          }
          changed = true;
        }
      }
    }
  }

  // ========== 反向遍历：计算 LS/LF ==========
  const lfMap = new Map<string, Date>();
  const lsMap = new Map<string, Date>();

  // 找到 projectEta（所有任务 EF 最大值）
  let projectEta = todayUTC;
  for (const id of sortedOrder) {
    const ef = efMap.get(id)!;
    if (ef > projectEta) {
      projectEta = ef;
    }
  }

  // 从后向前遍历
  for (let i = sortedOrder.length - 1; i >= 0; i--) {
    const id = sortedOrder[i];
    // 找所有后置依赖
    const nextDeps = validDeps.filter(d => d.prevTaskId === id);

    if (nextDeps.length === 0) {
      // 无后置：LF = projectEta（标准 CPM）
      lfMap.set(id, new Date(projectEta));
    } else {
      let latestLF = new Date(projectEta);
      for (const dep of nextDeps) {
        const nextId = dep.nextTaskId;
        const nextLS = lsMap.get(nextId)!;
        const nextLF = lfMap.get(nextId)!;

        let candidateLF: Date;
        switch (dep.type) {
          case 'FS':
            // FS: prevTask.LF = nextTask.LS - lagDays
            candidateLF = subtractWorkdays(nextLS, dep.lagDays);
            break;
          case 'SS':
            // SS: prevTask.LS = nextTask.LS - lagDays（约束开始时间，LF 同减）
            candidateLF = subtractWorkdays(nextLS, dep.lagDays);
            break;
          case 'FF':
            // FF: prevTask.LF = nextTask.LF - lagDays
            candidateLF = subtractWorkdays(nextLF, dep.lagDays);
            break;
          case 'SF':
            // SF: prevTask.LF = nextTask.LF - lagDays（近似，SF 严格约束开始）
            candidateLF = subtractWorkdays(nextLF, dep.lagDays);
            break;
          default:
            candidateLF = subtractWorkdays(nextLS, dep.lagDays);
        }
        if (candidateLF < latestLF) {
          latestLF = candidateLF;
        }
      }
      lfMap.set(id, latestLF);
    }

    const task = taskMap.get(id)!;
    const durationDays = task.estimatedHours != null && task.estimatedHours > 0
      ? Math.ceil(task.estimatedHours / 8)
      : 1;

    // LS = LF - (durationDays - 1)：与正向 EF = ES + dur - 1 对称
    const ls = subtractWorkdays(lfMap.get(id)!, Math.max(0, durationDays - 1));
    lsMap.set(id, ls);
  }

  // ========== 计算 slack 和关键路径 ==========
  const planTasks: PlanTask[] = [];
  const criticalPath: string[] = [];
  const milestones: string[] = [];

  for (const id of sortedOrder) {
    const task = taskMap.get(id)!;
    const es = esMap.get(id)!;
    const ef = efMap.get(id)!;
    const ls = lsMap.get(id)!;
    const lf = lfMap.get(id)!;
    const durationDays = task.estimatedHours != null && task.estimatedHours > 0
      ? Math.ceil(task.estimatedHours / 8)
      : 1;

    // slackDays = LS - ES（以工作日计）
    const slackDays = Math.round((ls.getTime() - es.getTime()) / 86400000);

    const isCritical = slackDays === 0;
    const isMilestone = (isCritical && task.dueAt != null) || durationDays === 0;

    if (isCritical) {
      criticalPath.push(id);
    }
    if (isMilestone) {
      milestones.push(id);
    }

    planTasks.push({
      id,
      title: task.title,
      status: task.status,
      durationDays,
      es: es.toISOString(),
      ef: ef.toISOString(),
      ls: ls.toISOString(),
      lf: lf.toISOString(),
      slackDays,
      critical: isCritical,
      milestone: isMilestone,
      eta: ef.toISOString(),
      dueAt: task.dueAt,
    });
  }

  // 计算 projectSlackDays（关键路径外的最大 slack）
  let projectSlackDays = 0;
  for (const t of planTasks) {
    if (t.slackDays > projectSlackDays) {
      projectSlackDays = t.slackDays;
    }
  }

  return {
    projectId,
    calculatedAt: new Date().toISOString(),
    tasks: planTasks,
    criticalPath,
    projectEta: projectEta.toISOString(),
    projectSlackDays,
    milestones,
    assumptions: [
      '工期=estimated_hours/8 天，无估时默认 1 天',
      '起点=今天 00:00 UTC',
      '周末顺延（addWorkdays 跳过周六日）',
      '已完成/done 和已取消/cancelled 任务不参与计算',
    ],
  };
}
