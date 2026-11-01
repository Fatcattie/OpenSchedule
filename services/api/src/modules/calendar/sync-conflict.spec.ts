import { describe, expect, it } from 'vitest'
import { decideCalendarSync } from './sync-conflict'

describe('calendar sync conflict policy', () => {
  const baseline = new Date('2026-08-22T10:00:00Z')

  it('pushes task-only changes and pulls calendar-only changes', () => {
    expect(decideCalendarSync({ taskUpdatedAt: new Date('2026-08-22T11:00:00Z'), calendarUpdatedAt: baseline, lastSyncedAt: baseline }, 'manual')).toEqual({ action: 'push', reason: 'task_changed' })
    expect(decideCalendarSync({ taskUpdatedAt: baseline, calendarUpdatedAt: new Date('2026-08-22T11:00:00Z'), lastSyncedAt: baseline }, 'manual')).toEqual({ action: 'pull', reason: 'calendar_changed' })
  })

  it('applies the configured policy when both sides changed', () => {
    const snapshot = { taskUpdatedAt: new Date('2026-08-22T11:00:00Z'), calendarUpdatedAt: new Date('2026-08-22T12:00:00Z'), lastSyncedAt: baseline }
    expect(decideCalendarSync(snapshot, 'task_wins').action).toBe('push')
    expect(decideCalendarSync(snapshot, 'calendar_wins').action).toBe('pull')
    expect(decideCalendarSync(snapshot, 'manual').action).toBe('conflict')
  })

  it('does not report a change when both sides match the baseline', () => {
    expect(decideCalendarSync({ taskUpdatedAt: baseline, calendarUpdatedAt: baseline, lastSyncedAt: baseline }, 'manual')).toEqual({ action: 'noop', reason: 'unchanged' })
  })
})
