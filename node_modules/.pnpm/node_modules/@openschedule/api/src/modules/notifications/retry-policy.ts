export function retryDelayMinutes(attempts: number): number {
  const normalized = Math.max(1, Math.floor(attempts))
  return Math.min(60, 2 ** normalized)
}

export function nextRetryAt(attempts: number, now = new Date()): Date {
  return new Date(now.getTime() + retryDelayMinutes(attempts) * 60 * 1000)
}
