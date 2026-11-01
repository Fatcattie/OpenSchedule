/**
 * 任务阻塞升级判定（纯函数，§3.2 / R3）：blocked_at 超过阈值且未发过升级通知才升级（去重由 DB 原子认领兜底）。
 */

/** 是否满足升级条件：blocked_at 非空、未升级过、且阻塞时长 ≥ 阈值（默认 72h） */
export function isBlockedEscalationDue(
  blockedAt: Date | null | undefined,
  blockEscalatedAt: Date | null | undefined,
  now: Date,
  thresholdMs: number = 72 * 60 * 60 * 1000,
): boolean {
  if (!blockedAt || blockEscalatedAt) return false;
  return now.getTime() - blockedAt.getTime() >= thresholdMs;
}
