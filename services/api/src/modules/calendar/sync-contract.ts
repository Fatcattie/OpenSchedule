import type { ExternalCalendarEvent } from './calendar-adapter'

export function externalEventToTaskPatch(event: ExternalCalendarEvent): { title: string; description: string; dueAt: Date | null } {
  const dueAt = 'date' in event.start ? new Date(`${event.start.date}T00:00:00.000Z`) : new Date(event.start.dateTime)
  return {
    title: event.summary,
    description: event.description ?? '',
    dueAt: Number.isNaN(dueAt.getTime()) ? null : dueAt,
  }
}
