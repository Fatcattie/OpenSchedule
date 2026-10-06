/**
 * 职责：附件取图适配层单测（增量 11 · T01 / T05）。
 *
 * 照 `auth.test.ts:5` 的姿势**直接 mock 原生包**（而非依赖 `.web.ts` —— jest 下
 * `haste.defaultPlatform='ios'`，`.web.ts` 根本不会被解析）。
 *
 * 覆盖：
 *  ① `isSourceSupported`（native 恒 true）；
 *  ② 权限降级三态：granted / !granted+canAskAgain / !granted+!canAskAgain；
 *  ③ 用户取消；
 *  ④ 元信息归一化（`fileName` / `mimeType` 兜底）；
 *  ⑤ `document` 无权限环节且字段名不同（`name` / `size`，非 `fileName` / `fileSize`）；
 *  ⑥ 原生调用异常 ⇒ 安全回落（`cancelled:false` + `file:null`，交由 UI 走到失败态）。
 */
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { isSourceSupported, pickFile } from '@/services/platform/attachmentPicker'

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}))

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}))

const cameraPermission = ImagePicker.requestCameraPermissionsAsync as unknown as jest.Mock
const libraryPermission = ImagePicker.requestMediaLibraryPermissionsAsync as unknown as jest.Mock
const launchCamera = ImagePicker.launchCameraAsync as unknown as jest.Mock
const launchLibrary = ImagePicker.launchImageLibraryAsync as unknown as jest.Mock
const getDocument = DocumentPicker.getDocumentAsync as unknown as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

describe('isSourceSupported', () => {
  it('native 上三个来源全部可用', () => {
    expect(isSourceSupported('camera')).toBe(true)
    expect(isSourceSupported('library')).toBe(true)
    expect(isSourceSupported('document')).toBe(true)
  })
})

describe('pickFile —— 权限降级', () => {
  it('权限未授予且可再询问 ⇒ permissionDenied + canAskAgain', async () => {
    cameraPermission.mockResolvedValue({ granted: false, canAskAgain: true })
    const result = await pickFile('camera')
    expect(result).toEqual({
      cancelled: false,
      file: null,
      permissionDenied: true,
      canAskAgain: true,
    })
    expect(launchCamera).not.toHaveBeenCalled()
  })

  it('权限未授予且不可再询问 ⇒ canAskAgain=false（UI 引导去系统设置）', async () => {
    libraryPermission.mockResolvedValue({ granted: false, canAskAgain: false })
    const result = await pickFile('library')
    expect(result.permissionDenied).toBe(true)
    expect(result.canAskAgain).toBe(false)
    expect(launchLibrary).not.toHaveBeenCalled()
  })

  it('权限已授予 ⇒ 正常取图', async () => {
    cameraPermission.mockResolvedValue({ granted: true, canAskAgain: true })
    launchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/a.jpg', fileName: 'a.jpg', mimeType: 'image/jpeg', fileSize: 1024 }],
    })
    const result = await pickFile('camera')
    expect(result.permissionDenied).toBe(false)
    expect(result.file?.uri).toBe('file:///cache/a.jpg')
  })
})

describe('pickFile —— 取消与归一化', () => {
  it('用户取消 ⇒ cancelled=true 且无文件', async () => {
    libraryPermission.mockResolvedValue({ granted: true, canAskAgain: true })
    launchLibrary.mockResolvedValue({ canceled: true, assets: null })
    const result = await pickFile('library')
    expect(result.cancelled).toBe(true)
    expect(result.file).toBeNull()
  })

  it('assets 为空数组也判为取消（防 Web 语义差异）', async () => {
    libraryPermission.mockResolvedValue({ granted: true, canAskAgain: true })
    launchLibrary.mockResolvedValue({ canceled: false, assets: [] })
    const result = await pickFile('library')
    expect(result.cancelled).toBe(true)
  })

  it('fileName 缺失时用时间戳兜底', async () => {
    cameraPermission.mockResolvedValue({ granted: true, canAskAgain: true })
    launchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/x.jpg', mimeType: 'image/jpeg', fileSize: 10 }],
    })
    const result = await pickFile('camera')
    expect(result.file?.fileName).toMatch(/^IMG_\d{8}_\d{6}\.jpg$/)
  })

  it('mimeType 缺失时由 uri 扩展名兜底', async () => {
    cameraPermission.mockResolvedValue({ granted: true, canAskAgain: true })
    launchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/x.heic', fileName: 'x.heic', fileSize: 10 }],
    })
    const result = await pickFile('camera')
    expect(result.file?.mimeType).toBe('image/heic')
  })

  it('取图选项按入参透传（quality / allowsEditing）', async () => {
    cameraPermission.mockResolvedValue({ granted: true, canAskAgain: true })
    launchCamera.mockResolvedValue({ canceled: true, assets: null })
    await pickFile('camera', { quality: 0.7, allowsEditing: true })
    expect(launchCamera).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true }),
    )
  })
})

describe('pickFile —— document 分支', () => {
  it('无权限环节，直接取文件', async () => {
    getDocument.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/r.pdf', name: 'r.pdf', mimeType: 'application/pdf', size: 2048 }],
    })
    const result = await pickFile('document')
    expect(cameraPermission).not.toHaveBeenCalled()
    expect(libraryPermission).not.toHaveBeenCalled()
    expect(result.permissionDenied).toBe(false)
    expect(result.file).toMatchObject({
      uri: 'file:///cache/r.pdf',
      fileName: 'r.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
    })
  })

  it('document 取消', async () => {
    getDocument.mockResolvedValue({ canceled: true, assets: null })
    const result = await pickFile('document')
    expect(result.cancelled).toBe(true)
  })
})

describe('pickFile —— 异常安全回落', () => {
  it('原生调用抛错 ⇒ 回落到「非取消、无文件」的安全态（UI 据此走失败态）', async () => {
    cameraPermission.mockResolvedValue({ granted: true, canAskAgain: true })
    launchCamera.mockRejectedValue(new Error('native crash'))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const result = await pickFile('camera')
    expect(result).toEqual({
      cancelled: false,
      file: null,
      permissionDenied: false,
      canAskAgain: true,
    })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
