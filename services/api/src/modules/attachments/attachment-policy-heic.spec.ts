import { describe, expect, it } from 'vitest'
import { validateAttachmentMetadata } from './attachment-policy'

describe('attachment policy — HEIC/HEIF 放宽（增量 11）', () => {
  it('accepts HEIC and HEIF photo types', () => {
    expect(validateAttachmentMetadata(1024, 'image/heic')).toBeNull()
    expect(validateAttachmentMetadata(1024, 'image/heif')).toBeNull()
  })

  it('accepts HEIC case-insensitively', () => {
    expect(validateAttachmentMetadata(1024, 'IMAGE/HEIC')).toBeNull()
    expect(validateAttachmentMetadata(1024, 'Image/Heif')).toBeNull()
  })

  it('still rejects text/* — widening HEIC did not open up text', () => {
    expect(validateAttachmentMetadata(1024, 'text/plain')).toContain('白名单')
    expect(validateAttachmentMetadata(1024, 'text/html')).toContain('白名单')
  })

  it('still rejects image types outside the whitelist', () => {
    expect(validateAttachmentMetadata(1024, 'image/svg+xml')).toContain('白名单')
    expect(validateAttachmentMetadata(1024, 'image/bmp')).toContain('白名单')
    expect(validateAttachmentMetadata(1024, 'video/mp4')).toContain('白名单')
  })
})
