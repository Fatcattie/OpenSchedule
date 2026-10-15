/**
 * 职责：附件取图适配层（native 实现）—— 使用 expo-image-picker（拍照 / 相册 + 权限）
 * 与 expo-document-picker（任意文件）取回文件并归一化三端差异。
 * Web 端由同目录 `attachmentPicker.web.ts` 覆盖，避免 Web 打包引入原生权限代码路径（ARCH §2.1 / §8.1）。
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
  /** 是否允许系统裁剪 / 编辑（仅 camera / library 生效；iOS 开启会强制重编码） */
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

/** 归一化 ImagePicker 资源 → PickedFile */
function mapImageAsset(asset: ImagePicker.ImagePickerAsset): PickedFile {
  const uri = asset.uri
  const ext = extensionFromPath(uri) || extensionFromMime(asset.mimeType) || 'jpg'
  const fileName = (asset.fileName ?? '').trim() || `IMG_${formatTimestamp(new Date())}.${ext}`
  const mimeType = asset.mimeType || mimeFromExtension(ext) || 'image/jpeg'
  const sizeBytes = asset.fileSize ?? 0
  return { uri, fileName, mimeType, sizeBytes }
}

/** 归一化 DocumentPicker 资源 → PickedFile */
function mapDocumentAsset(asset: DocumentPickerAsset): PickedFile {
  const uri = asset.uri
  const ext = extensionFromPath(asset.name) || extensionFromPath(uri) || extensionFromMime(asset.mimeType)
  const fallbackName = ext ? `IMG_${formatTimestamp(new Date())}.${ext}` : `IMG_${formatTimestamp(new Date())}`
  const fileName = (asset.name ?? '').trim() || fallbackName
  const mimeType = asset.mimeType || mimeFromExtension(ext)
  const sizeBytes = asset.size ?? 0
  return { uri, fileName, mimeType, sizeBytes }
}

/** 该来源在当前平台是否可用（native 恒 true） */
export function isSourceSupported(source: PickSource): boolean {
  void source
  return true
}

/** 取一个文件（含权限申请；点按入口时调用） */
export async function pickFile(source: PickSource, options?: PickOptions): Promise<PickResult> {
  if (source === 'document') return pickDocument()
  return pickImage(source, options)
}

/** 拍照 / 相册取图（含权限申请与降级） */
async function pickImage(source: 'camera' | 'library', options?: PickOptions): Promise<PickResult> {
  try {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      return { cancelled: false, file: null, permissionDenied: true, canAskAgain: permission.canAskAgain }
    }

    const pickerOptions: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: options?.quality,
      allowsEditing: options?.allowsEditing,
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions)

    if (result.canceled) {
      return { cancelled: true, file: null, permissionDenied: false, canAskAgain: true }
    }
    const asset = result.assets[0]
    if (!asset) {
      return { cancelled: true, file: null, permissionDenied: false, canAskAgain: true }
    }
    return { cancelled: false, file: mapImageAsset(asset), permissionDenied: false, canAskAgain: true }
  } catch (error) {
    console.warn('[attachmentPicker] pickImage 失败，已回落为安全默认值', error)
    return { cancelled: false, file: null, permissionDenied: false, canAskAgain: true }
  }
}

/** 任意文件选择（无权限环节） */
async function pickDocument(): Promise<PickResult> {
  try {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false })
    if (result.canceled) {
      return { cancelled: true, file: null, permissionDenied: false, canAskAgain: true }
    }
    const asset = result.assets[0]
    if (!asset) {
      return { cancelled: true, file: null, permissionDenied: false, canAskAgain: true }
    }
    return { cancelled: false, file: mapDocumentAsset(asset), permissionDenied: false, canAskAgain: true }
  } catch (error) {
    console.warn('[attachmentPicker] pickDocument 失败，已回落为安全默认值', error)
    return { cancelled: false, file: null, permissionDenied: false, canAskAgain: true }
  }
}
