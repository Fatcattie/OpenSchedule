/**
 * 职责：附件校验与预览工具 —— 单文件大小上限（≤20MB）与 MIME 白名单（PRD 6.5 / M-P0-12）。
 * 纯函数模块，供 service 层与页面共用；不依赖 React / React Native 运行时，便于单元测试。
 */
import { formatBytes } from './format'
import { translate } from '@/i18n'
import { getCurrentLocale } from '@/i18n/current'

/** 单文件大小上限：20MB */
export const ATTACHMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024

/** 附件不合法（超限 / 类型不在白名单）业务错误码 */
export const ERR_INVALID_ATTACHMENT = 42201

/** 允许的 MIME 精确值（PDF / ZIP） */
export const ATTACHMENT_ALLOWED_MIME_EXACT: readonly string[] = ['application/pdf', 'application/zip']

/** 允许的 MIME 前缀（图片 / 文本 / Office OpenXML） */
export const ATTACHMENT_ALLOWED_MIME_PREFIXES: readonly string[] = [
  'image/',
  'text/',
  'application/vnd.openxmlformats-officedocument.',
]

/** 待校验的文件元信息（mock 文件选择结果 / 真实上传前置校验共用） */
export interface AttachmentFileMeta {
  fileName: string
  mimeType: string
  sizeBytes: number
  /** native 临时文件 uri（新增，可选）：真实上传分支组 multipart 用 */
  uri?: string
  /** Web File（新增，可选）：Web 组 FormData 用；native 为 undefined */
  file?: File
}

/** 校验结果：ok=false 时 message 为可直接展示的中文提示 */
export interface AttachmentValidationResult {
  ok: boolean
  message: string
}

/** 是否为允许的 MIME 类型（大小写不敏感） */
export function isAllowedMimeType(mimeType: string): boolean {
  if (!mimeType) return false
  const mime = mimeType.trim().toLowerCase()
  if (ATTACHMENT_ALLOWED_MIME_EXACT.includes(mime)) return true
  return ATTACHMENT_ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))
}

/**
 * 校验附件大小与类型。
 * 规则：文件名非空 → 大小有效且 ≤20MB → MIME 命中白名单。
 */
export function validateAttachment(meta: AttachmentFileMeta): AttachmentValidationResult {
  const fileName = meta.fileName?.trim() ?? ''
  if (!fileName) return { ok: false, message: translate(getCurrentLocale(), 'attachment.emptyName') }
  if (!Number.isFinite(meta.sizeBytes) || meta.sizeBytes <= 0) {
    return { ok: false, message: translate(getCurrentLocale(), 'attachment.invalidSize') }
  }
  if (meta.sizeBytes > ATTACHMENT_MAX_SIZE_BYTES) {
    return {
      ok: false,
      message: translate(getCurrentLocale(), 'attachment.tooLarge', {
        current: formatBytes(meta.sizeBytes),
      }),
    }
  }
  if (!isAllowedMimeType(meta.mimeType)) {
    return {
      ok: false,
      message: translate(getCurrentLocale(), 'attachment.unsupportedType', {
        mime: meta.mimeType || translate(getCurrentLocale(), 'attachment.unknownMime'),
      }),
    }
  }
  return { ok: true, message: '' }
}

/** 清洗文件名（去掉路径分隔符与空白，用于生成 objectKey） */
export function sanitizeFileName(fileName: string): string {
  return fileName.trim().replace(/[\\/]/g, '_').replace(/\s+/g, '_')
}

/** mock 预览地址（Web 端用 Linking.openURL 打开，native 端为演示占位） */
export function mockAttachmentUrl(objectKey: string): string {
  return `https://mock.openschedule.local/files/${objectKey}`
}
