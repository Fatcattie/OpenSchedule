export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

const MIME_WHITELIST = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'image/heic', 'image/heif', // ← 增量 11：iPhone 相机直出为 HEIC，用户拍板放宽（ARCH §2.7）
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip', 'application/x-zip-compressed', 'application/x-7z-compressed',
])

export function validateAttachmentMetadata(size: number, mimetype: string): string | null {
  if (size <= 0) return '不允许上传空文件'
  if (size > MAX_ATTACHMENT_BYTES) return '文件大小超过 20MB 上限（§3.5.5）'
  const normalized = mimetype.toLowerCase()
  return MIME_WHITELIST.has(normalized) ? null : `文件类型 ${normalized} 不在白名单内（图片/PDF/Office/zip）`
}
