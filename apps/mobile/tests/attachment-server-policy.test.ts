/**
 * 职责：服务端可接收性预检单测（增量 11 · T02 / T05）。
 *
 * 背景：移动端 `isAllowedMimeType` 放行 `text/*` 与任意 `image/*`，而服务端白名单是**精确枚举**，
 * 预检层负责在上传前把「本地放行、服务端必拒」的类型拦下并给出中文出路。
 *
 * 覆盖：HEIC/HEIF 放行 · `text/*` 拦截并带出路 · `video/*` 拦截 · 非白名单图片拦截 ·
 * 扩展名兜底（mimeType 空 / 被错标）· MIME 参数归一化 · `mimeFromFileName` 基本映射。
 */
import {
  SERVER_ACCEPTED_MIME,
  mimeFromFileName,
  precheckServerAcceptability,
} from '@/utils/attachmentServerPolicy'

describe('precheckServerAcceptability —— 服务端白名单放行', () => {
  it('HEIC / HEIF 放行（后端已放宽，iPhone 相机直出）', () => {
    expect(precheckServerAcceptability({ fileName: 'IMG_0001.heic', mimeType: 'image/heic', sizeBytes: 2048 }).ok).toBe(true)
    expect(precheckServerAcceptability({ fileName: 'IMG_0002.heif', mimeType: 'image/heif', sizeBytes: 2048 }).ok).toBe(true)
    expect(SERVER_ACCEPTED_MIME.has('image/heic')).toBe(true)
    expect(SERVER_ACCEPTED_MIME.has('image/heif')).toBe(true)
  })

  it('常规白名单类型放行', () => {
    const cases = [
      { fileName: 'a.jpg', mimeType: 'image/jpeg' },
      { fileName: 'b.png', mimeType: 'image/png' },
      { fileName: 'c.pdf', mimeType: 'application/pdf' },
      { fileName: 'd.zip', mimeType: 'application/zip' },
      {
        fileName: 'e.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    ]
    cases.forEach((meta) => {
      expect(precheckServerAcceptability({ ...meta, sizeBytes: 1024 }).ok).toBe(true)
    })
  })

  it('MIME 大小写与参数不影响判定', () => {
    expect(precheckServerAcceptability({ fileName: 'a.png', mimeType: 'IMAGE/PNG', sizeBytes: 1024 }).ok).toBe(true)
    expect(
      precheckServerAcceptability({ fileName: 'b.pdf', mimeType: 'application/pdf; charset=binary', sizeBytes: 1024 }).ok,
    ).toBe(true)
  })
})

describe('precheckServerAcceptability —— 拦截与中文出路', () => {
  it('text/* 拦截，归类 text 且给出「另存为 PDF」出路', () => {
    const result = precheckServerAcceptability({ fileName: 'notes.txt', mimeType: 'text/plain', sizeBytes: 100 })
    expect(result.ok).toBe(false)
    expect(result.kind).toBe('text')
    expect(result.message).toContain('文本类附件暂不支持上传')
    expect(result.hint).toBeTruthy()
    expect(result.hint).toContain('PDF')
  })

  it('text/* 带参数也被拦截（归一化后判定）', () => {
    const result = precheckServerAcceptability({
      fileName: 'notes.txt',
      mimeType: 'text/plain; charset=utf-8',
      sizeBytes: 100,
    })
    expect(result.ok).toBe(false)
    expect(result.kind).toBe('text')
  })

  it('video/* 拦截，归类 video', () => {
    const result = precheckServerAcceptability({ fileName: 'clip.mov', mimeType: 'video/quicktime', sizeBytes: 32_000_000 })
    expect(result.ok).toBe(false)
    expect(result.kind).toBe('video')
    expect(result.message).toContain('暂不支持视频附件')
  })

  it('非白名单图片格式拦截，归类 image-unsupported', () => {
    const result = precheckServerAcceptability({ fileName: 'logo.svg', mimeType: 'image/svg+xml', sizeBytes: 1024 })
    expect(result.ok).toBe(false)
    expect(result.kind).toBe('image-unsupported')
    expect(result.message).toContain('暂不支持该图片格式')
  })

  it('可执行程序拦截', () => {
    const result = precheckServerAcceptability({
      fileName: 'setup.exe',
      mimeType: 'application/x-msdownload',
      sizeBytes: 2_000_000,
    })
    expect(result.ok).toBe(false)
    expect(result.message).toBeTruthy()
  })

  it('无法识别的类型归类 unknown', () => {
    const result = precheckServerAcceptability({ fileName: 'data.bin', mimeType: '', sizeBytes: 1024 })
    expect(result.ok).toBe(false)
    expect(result.kind).toBe('unknown')
    expect(result.message).toContain('无法识别的文件类型')
  })
})

describe('precheckServerAcceptability —— 扩展名兜底（防 mimeType 被错标）', () => {
  it('mimeType 为空时由扩展名推导并拦截', () => {
    const result = precheckServerAcceptability({ fileName: 'readme.txt', mimeType: '', sizeBytes: 100 })
    expect(result.ok).toBe(false)
    expect(result.kind).toBe('text')
  })

  it('mimeType 被错标为 image/jpeg 但扩展名是 .txt ⇒ 仍拦截', () => {
    const result = precheckServerAcceptability({ fileName: 'readme.txt', mimeType: 'image/jpeg', sizeBytes: 100 })
    expect(result.ok).toBe(false)
    expect(result.kind).toBe('text')
  })

  it('mimeType 被错标为 image/jpeg 但扩展名是 .mp4 ⇒ 仍拦截', () => {
    const result = precheckServerAcceptability({ fileName: 'clip.mp4', mimeType: 'image/jpeg', sizeBytes: 1024 })
    expect(result.ok).toBe(false)
    expect(result.kind).toBe('video')
  })

  it('扩展名为白名单类型时，即使 mimeType 为空也放行', () => {
    expect(precheckServerAcceptability({ fileName: 'photo.heic', mimeType: '', sizeBytes: 2048 }).ok).toBe(true)
    expect(precheckServerAcceptability({ fileName: 'doc.pdf', mimeType: '', sizeBytes: 2048 }).ok).toBe(true)
  })
})

describe('mimeFromFileName —— 扩展名推导', () => {
  it('常见映射正确', () => {
    expect(mimeFromFileName('a.jpg')).toBe('image/jpeg')
    expect(mimeFromFileName('a.jpeg')).toBe('image/jpeg')
    expect(mimeFromFileName('a.png')).toBe('image/png')
    expect(mimeFromFileName('a.heic')).toBe('image/heic')
    expect(mimeFromFileName('a.pdf')).toBe('application/pdf')
    expect(mimeFromFileName('a.zip')).toBe('application/zip')
    expect(mimeFromFileName('a.txt')).toBe('text/plain')
    expect(mimeFromFileName('a.mp4')).toBe('video/mp4')
    expect(mimeFromFileName('a.exe')).toBe('application/x-msdownload')
  })

  it('大小写不敏感；无扩展名 / 未知扩展名返回空串', () => {
    expect(mimeFromFileName('A.PNG')).toBe('image/png')
    expect(mimeFromFileName('noext')).toBe('')
    expect(mimeFromFileName('a.unknownext')).toBe('')
    expect(mimeFromFileName('')).toBe('')
  })

  it('带查询串的文件名仍能取到扩展名', () => {
    expect(mimeFromFileName('photo.jpg?token=abc')).toBe('image/jpeg')
  })
})
