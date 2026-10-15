/**
 * 职责：附件取图适配层（Web 实现）—— 使用 expo-image-picker（相册）+ expo-document-picker（任意文件）。
 * 与 native 版 `attachmentPicker.ts` 逐字节同签名；差异：
 * ① Web 不支持「拍照」（`capture` 属性桌面端普遍被忽略，ARCH §2.1 / §5.4）；
 * ② 浏览器不返回 `canceled`，判空只能用 `assets` 为空；
 * ③ 必须回传 `asset.file`（DOM `File`）供组 `FormData`；
 * ④ 权限 API 在 Web 为 no-op ⇒ 完全跳过权限环节（`permissionDenied` 恒 false）。
 */

import * as DocumentPicker from 'expo-document-picker'
import type { DocumentPickerAsset } from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'

/** 取图来源：拍照 / 相册 / 任意文件 */
export type PickSource = 'camera' | 'library' | 'document'

/** 取图选项（仅 camera / library 生效；document 忽略） */
export interface PickOptions {
  /** 图片压缩质量（0..1），仅 camera / library 生效；document 忽略 */
  quality?: number
  /** 是否允许系统裁剪 / 编辑（仅 camera / library 生效；Web 忽略） */
  allowsEditing?: boolean
}

/** 取图结果（已归一化三端差异） */
export interface PickedFile {
  /** native：临时文件 uri（cache 目录）；web：blob: URL 或 '' */
  uri: string
  fileName: string
  mimeType: string
  sizeBytes: number
  /** Web 专有 File（组 FormData 用）；native 为 undefined */
  file?: File
}

/** 取图整体结果 */
export interface PickResult {
  /** 用户取消 / 未选（三端统一） */
  cancelled: boolean
  file: PickedFile | null
  /** 权限被拒（仅 camera / library；document 恒 false） */
  permissionDenied: boolean
  /** 被拒时是否还可再次询问（false ⇒ UI 引导去系统设置） */
  canAskAgain: boolean
}

/** 扩展名 → MIME 兜底映射（asset.mimeType 可为 null） */
const MIME_BY_EXT: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
  zip: 'application/zip',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

/** MIME → 扩展名兜底映射（uri 无扩展名时由 mimeType 反推） */
const EXT_BY_MIME: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/bmp': 'bmp',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

/** 数字补零到两位 */
function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** 本地时间格式化：YYYYMMDD_HHmmss（不引第三方库） */
function formatTimestamp(date: Date): string {
  const year = date.getFullYear()
  const month = pad2(date.getMonth() + 1)
  const day = pad2(date.getDate())
  const hours = pad2(date.getHours())
  const minutes = pad2(date.getMinutes())
  const seconds = pad2(date.getSeconds())
  return `${year}${month}${day}_${hours}${minutes}${seconds}`
}

/** 从路径 / uri / 文件名中提取小写扩展名（去查询串；非法字符返回空串） */
function extensionFromPath(input: string): string {
  const clean = input.split('?')[0].split('#')[0]
  const dotIndex = clean.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === clean.length - 1) return ''
  const ext = clean.slice(dotIndex + 1).toLowerCase()
  return /^[a-z0-9]+$/.test(ext) ? ext : ''
}

/** 扩展名 → MIME（未知返回空串） */
function mimeFromExtension(ext: string): string {
  if (!ext) return ''
  return MIME_BY_EXT[ext] ?? ''
}

/** MIME → 扩展名（未知返回空串；忽略 `;` 参数） */
function extensionFromMime(mimeType: string | null | undefined): string {
  if (!mimeType) return ''
  const normalized = mimeType.split(';')[0].trim().toLowerCase()
  return EXT_BY_MIME[normalized] ?? ''
}

/** 归一化 ImagePicker 资源 → PickedFile（Web 带 `asset.file`） */
function mapImageAsset(asset: ImagePicker.ImagePickerAsset): PickedFile {
  const ext = extensionFromPath(asset.fileName ?? asset.uri) || extensionFromMime(asset.mimeType) || 'jpg'
  const fileName = (asset.fileName ?? '').trim() || `IMG_${formatTimestamp(new Date())}.${ext}`
  const mimeType = asset.mimeType || mimeFromExtension(ext) || 'image/jpeg'
  const sizeBytes = asset.fileSize ?? 0
  const picked: PickedFile = { uri: asset.uri || '', fileName, mimeType, sizeBytes }
  if (asset.file) picked.file = asset.file
  return picked
}

/** 归一化 DocumentPicker 资源 → PickedFile（Web 带 `asset.file`） */
function mapDocumentAsset(asset: DocumentPickerAsset): PickedFile {
  const ext = extensionFromPath(asset.name) || extensionFromPath(asset.uri) || extensionFromMime(asset.mimeType)
  const fallbackName = ext ? `IMG_${formatTimestamp(new Date())}.${ext}` : `IMG_${formatTimestamp(new Date())}`
  const fileName = (asset.name ?? '').trim() || fallbackName
  const mimeType = asset.mimeType || mimeFromExtension(ext)
  const sizeBytes = asset.size ?? 0
  const picked: PickedFile = { uri: asset.uri || '', fileName, mimeType, sizeBytes }
  if (asset.file) picked.file = asset.file
  return picked
}

/** 该来源在当前平台是否可用（Web：camera=false，其余 true） */
export function isSourceSupported(source: PickSource): boolean {
  return source !== 'camera'
}

/** 取一个文件（Web 无权限环节；点按入口时调用） */
export async function pickFile(source: PickSource, options?: PickOptions): Promise<PickResult> {
  if (source === 'camera') {
    // Web 不支持拍照：直接回落「未选」，由 UI 侧 `isSourceSupported` 不渲染该入口
    return { cancelled: true, file: null, permissionDenied: false, canAskAgain: true }
  }
  if (source === 'document') return pickDocument()
  return pickImageLibrary(options)
}

/** 相册取图（Web 忽略 quality / allowsEditing，上传原文件） */
async function pickImageLibrary(options?: PickOptions): Promise<PickResult> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: options?.quality,
      allowsEditing: options?.allowsEditing,
    })
    // Web 不返回 `canceled`：只能用 assets 判空
    if (!result.assets || result.assets.length === 0) {
      return { cancelled: true, file: null, permissionDenied: false, canAskAgain: true }
    }
    return { cancelled: false, file: mapImageAsset(result.assets[0]), permissionDenied: false, canAskAgain: true }
  } catch (error) {
    console.warn('[attachmentPicker.web] pickImageLibrary 失败，已回落为安全默认值', error)
    return { cancelled: false, file: null, permissionDenied: false, canAskAgain: true }
  }
}

/** 任意文件选择（Web 无权限环节） */
async function pickDocument(): Promise<PickResult> {
  try {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false })
    // Web 上 cancel 事件不返回：canceled 与 assets 空两种判空都覆盖
    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { cancelled: true, file: null, permissionDenied: false, canAskAgain: true }
    }
    return { cancelled: false, file: mapDocumentAsset(result.assets[0]), permissionDenied: false, canAskAgain: true }
  } catch (error) {
    console.warn('[attachmentPicker.web] pickDocument 失败，已回落为安全默认值', error)
    return { cancelled: false, file: null, permissionDenied: false, canAskAgain: true }
  }
}
