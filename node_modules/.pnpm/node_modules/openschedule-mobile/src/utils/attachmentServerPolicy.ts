/**
 * 职责：服务端可接收性预检 —— 移动端 `isAllowedMimeType` 放行 `text/*` 与任意 `image/*`，
 * 而服务端白名单是**精确枚举**（`services/api/src/modules/attachments/attachment-policy.ts`），
 * 二者不一致 ⇒ 本模块在**发起上传之前**把「本地放行、服务端必拒」的类型拦下，并给出
 * 可直接展示的中文出路（ARCH 增量 11 §2.4）。
 *
 * 与既有 `validateAttachment` 的关系：**不改它**，二者**串联**执行 ——
 * 先 `validateAttachment`（≤20MB + 移动端白名单），再 `precheckServerAcceptability`（服务端口径）。
 *
 * 纯函数模块：不依赖 React / React Native 运行时，便于单元测试。
 */
import type { AttachmentFileMeta } from './attachment'
import { translate } from '@/i18n'
import { getCurrentLocale } from '@/i18n/current'

/**
 * 服务端白名单镜像（本次放宽后，与 `attachment-policy.ts` 的 `MIME_WHITELIST` 逐字对齐）。
 * 注意：`image/heic` / `image/heif` 已随本次增量进白名单（iPhone 相机直出为 HEIC）。
 */
export const SERVER_ACCEPTED_MIME: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
])

/** 预检结果：ok=false 时 message / hint 可直接展示给用户 */
export interface ServerPrecheckResult {
  /** 是否可上传 */
  ok: boolean
  /** ok=false 时的中文原因（可直接展示） */
  message: string
  /** ok=false 时可执行的替代做法（可选） */
  hint?: string
  /** 归类（供 UI 选图标 / 措辞） */
  kind?: 'text' | 'video' | 'image-unsupported' | 'unknown'
}

/** 扩展名 → MIME 兜底映射（asset.mimeType 可为 null / 被错标） */
const MIME_BY_EXT: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  avif: 'image/avif',
  pdf: 'application/pdf',
  zip: 'application/zip',
  '7z': 'application/x-7z-compressed',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  log: 'text/plain',
  json: 'application/json',
  xml: 'application/xml',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  exe: 'application/x-msdownload',
  msi: 'application/x-msdownload',
}

/** 从文件名中提取小写扩展名（去查询串 / hash；无扩展名或含非法字符返回空串） */
function extensionOf(fileName: string): string {
  const clean = fileName.split('?')[0].split('#')[0]
  const dotIndex = clean.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === clean.length - 1) return ''
  const ext = clean.slice(dotIndex + 1).toLowerCase()
  return /^[a-z0-9]+$/.test(ext) ? ext : ''
}

/** MIME 归一化：去 `;` 后的参数、去空、转小写 */
function normalizeMime(mimeType: string | null | undefined): string {
  return (mimeType ?? '').split(';')[0].trim().toLowerCase()
}

/**
 * 由文件名扩展名推导 MIME（兜底；asset.mimeType 可能为 null / 被错标）。
 * 无法推导返回空串。
 */
export function mimeFromFileName(fileName: string): string {
  const ext = extensionOf(fileName ?? '')
  if (!ext) return ''
  return MIME_BY_EXT[ext] ?? ''
}

/**
 * 「硬拒类别」：这类类型无论声明的 mimeType 看起来多可接受，都必须拦截。
 * 用于防「mimeType 被错标」导致的漏判（expo/expo#35714 对策）。
 */
function isHardReject(mime: string): boolean {
  if (!mime) return false
  return mime.startsWith('text/') || mime.startsWith('video/') || mime === 'application/x-msdownload'
}

/** 按被拒类型给出中文原因与出路 */
function describeRejection(mime: string): ServerPrecheckResult {
  if (mime.startsWith('text/')) {
    return {
      ok: false,
      message: translate(getCurrentLocale(), 'attachmentServer.textRejected'),
      hint: translate(getCurrentLocale(), 'attachmentServer.textHint'),
      kind: 'text',
    }
  }
  if (mime.startsWith('video/')) {
    return {
      ok: false,
      message: translate(getCurrentLocale(), 'attachmentServer.videoRejected'),
      kind: 'video',
    }
  }
  if (mime.startsWith('image/')) {
    return {
      ok: false,
      message: translate(getCurrentLocale(), 'attachmentServer.imageRejected'),
      hint: translate(getCurrentLocale(), 'attachmentServer.imageHint'),
      kind: 'image-unsupported',
    }
  }
  if (mime === 'application/x-msdownload') {
    return {
      ok: false,
      message: translate(getCurrentLocale(), 'attachmentServer.executableRejected'),
      kind: 'unknown',
    }
  }
  return {
    ok: false,
    message: translate(getCurrentLocale(), 'attachmentServer.unknownRejected'),
    kind: 'unknown',
  }
}

/**
 * 服务端可接收性预检：拦截「移动端放行、服务端必拒」的类型。
 *
 * 判定顺序：
 * 1. `declaredMime` = 声明 MIME 归一化；`extMime` = 由文件扩展名推导。
 * 2. **扩展名兜底**：任一侧命中「硬拒类别」（`text/*` / `video/*` / 可执行程序）⇒ 直接拦截。
 * 3. `effectiveMime` = `declaredMime || extMime`，命中服务端白名单 ⇒ 放行（**HEIC / HEIF 已放行**）。
 * 4. 否则按类给中文出路。
 */
export function precheckServerAcceptability(meta: AttachmentFileMeta): ServerPrecheckResult {
  const declaredMime = normalizeMime(meta?.mimeType)
  const extMime = mimeFromFileName(meta?.fileName ?? '')

  // 扩展名兜底：防 mimeType 被错标（声明侧与扩展名侧任一命中硬拒即拦截）
  if (isHardReject(declaredMime)) return describeRejection(declaredMime)
  if (isHardReject(extMime)) return describeRejection(extMime)

  const effectiveMime = declaredMime || extMime
  if (effectiveMime && SERVER_ACCEPTED_MIME.has(effectiveMime)) {
    return { ok: true, message: '' }
  }
  return describeRejection(effectiveMime)
}
