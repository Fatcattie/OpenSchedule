import { nextRetryAt, retryDelayMinutes } from './retry-policy'

describe('notification retry policy', () => {
  it('uses bounded exponential backoff', () => {
    expect(retryDelayMinutes(1)).toBe(2)
    expect(retryDelayMinutes(2)).toBe(4)
    expect(retryDelayMinutes(20)).toBe(60)
  })

  it('calculates the next retry from the supplied clock', () => {
    const now = new Date('2026-08-22T10:00:00.000Z')
    expect(nextRetryAt(2, now)).toEqual(new Date('2026-08-22T10:04:00.000Z'))
  })
})
