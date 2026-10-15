export type CalendarConflictStrategy = 'task_wins' | 'calendar_wins' | 'manual'

export interface CalendarSyncSnapshot {
  taskUpdatedAt: Date
  calendarUpdatedAt: Date
  lastSyncedAt: Date | null
}

export interface CalendarConflictDecision {
  action: 'pull' | 'push' | 'conflict' | 'noop'
  reason: 'task_changed' | 'calendar_changed' | 'both_changed' | 'unchanged'
}

/**
 * Decide the direction of a bidirectional sync using the last successful sync
 * as the common baseline. This is deliberately pure so provider adapters can
 * share the same conflict policy.
 */
export function decideCalendarSync(
  snapshot: CalendarSyncSnapshot,
  strategy: CalendarConflictStrategy,
): CalendarConflictDecision {
  if (!snapshot.lastSyncedAt) {
    return { action: 'push', reason: 'task_changed' }
  }

  const taskChanged = snapshot.taskUpdatedAt.getTime() > snapshot.lastSyncedAt.getTime()
  const calendarChanged = snapshot.calendarUpdatedAt.getTime() > snapshot.lastSyncedAt.getTime()

  if (taskChanged && calendarChanged) {
    if (strategy === 'task_wins') return { action: 'push', reason: 'both_changed' }
    if (strategy === 'calendar_wins') return { action: 'pull', reason: 'both_changed' }
    return { action: 'conflict', reason: 'both_changed' }
  }
  if (taskChanged) return { action: 'push', reason: 'task_changed' }
  if (calendarChanged) return { action: 'pull', reason: 'calendar_changed' }
  return { action: 'noop', reason: 'unchanged' }
}
