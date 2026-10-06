/**
 * 职责：附件大小 / 类型校验与上传落库单元测试（D-01）。
 * 覆盖：≤20MB 边界、MIME 白名单、非法类型 / 超限中文提示、上传落库与进度回调。
 */
import { DEMO_USER_IDS, db, resetDatabase } from '@/data'
import * as taskService from '@/services/task.service'
import {
  ATTACHMENT_MAX_SIZE_BYTES,
  ERR_INVALID_ATTACHMENT,
  isAllowedMimeType,
  validateAttachment,
} from '@/utils/attachment'

const ME = DEMO_USER_IDS.me

beforeEach(() => {
  resetDatabase()
})

describe('validateAttachment —— 大小与类型校验', () => {
  it('合法类型且在 20MB 以内通过', () => {
    expect(validateAttachment({ fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 1024 }).ok).toBe(true)
    expect(
      validateAttachment({ fileName: 'b.png', mimeType: 'image/png', sizeBytes: ATTACHMENT_MAX_SIZE_BYTES }).ok,
    ).toBe(true)
    expect(validateAttachment({ fileName: 'c.zip', mimeType: 'application/zip', sizeBytes: 1000 }).ok).toBe(true)
  })

  it('超过 20MB 给出中文错误提示', () => {
    const result = validateAttachment({
      fileName: 'big.mov',
      mimeType: 'application/pdf',
      sizeBytes: ATTACHMENT_MAX_SIZE_BYTES + 1,
    })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('20MB')
  })

  it('非法类型给出中文错误提示', () => {
    const result = validateAttachment({ fileName: 'x.exe', mimeType: 'application/x-msdownload', sizeBytes: 1000 })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('不支持的文件类型')
  })

  it('MIME 白名单判定（图片 / 文本 / Office / PDF / ZIP 通过，其余拒绝）', () => {
    expect(isAllowedMimeType('image/jpeg')).toBe(true)
    expect(isAllowedMimeType('text/plain')).toBe(true)
    expect(isAllowedMimeType('application/pdf')).toBe(true)
    expect(isAllowedMimeType('application/zip')).toBe(true)
    expect(
      isAllowedMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).toBe(true)
    expect(isAllowedMimeType('video/mp4')).toBe(false)
    expect(isAllowedMimeType('application/x-msdownload')).toBe(false)
  })
})

describe('uploadAttachment —— 上传落库', () => {
  it('合法文件落库，且进度回调最终为 1', async () => {
    const progress: number[] = []
    const attachment = await taskService.uploadAttachment(
      'task-001',
      { fileName: '评审结论.pdf', mimeType: 'application/pdf', sizeBytes: 2048 },
      ME,
      (ratio) => progress.push(ratio),
    )
    expect(attachment.resourceId).toBe('task-001')
    expect(attachment.fileName).toBe('评审结论.pdf')
    expect(attachment.sizeBytes).toBe(2048)
    expect(db.attachments.some((item) => item.id === attachment.id)).toBe(true)
    expect(progress.length).toBeGreaterThan(0)
    expect(progress[progress.length - 1]).toBe(1)
  })

  it('超限文件抛 42201 且不落库', async () => {
    const before = db.attachments.length
    await expect(
      taskService.uploadAttachment(
        'task-001',
        { fileName: '大文件.zip', mimeType: 'application/zip', sizeBytes: ATTACHMENT_MAX_SIZE_BYTES + 1 },
        ME,
      ),
    ).rejects.toMatchObject({ code: ERR_INVALID_ATTACHMENT })
    expect(db.attachments.length).toBe(before)
  })

  it('非法类型抛 42201', async () => {
    await expect(
      taskService.uploadAttachment(
        'task-001',
        { fileName: 'run.exe', mimeType: 'application/x-msdownload', sizeBytes: 1000 },
        ME,
      ),
    ).rejects.toMatchObject({ code: ERR_INVALID_ATTACHMENT })
  })
})

describe('validateAttachment —— 边界补强', () => {
  it('文件名为空 / 纯空白 → 拒绝并给出中文提示', () => {
    expect(validateAttachment({ fileName: '', mimeType: 'application/pdf', sizeBytes: 10 }).message).toContain(
      '文件名',
    )
    expect(validateAttachment({ fileName: '   ', mimeType: 'application/pdf', sizeBytes: 10 }).ok).toBe(false)
  })

  it('大小无效（0 / 负数 / NaN）→ 拒绝', () => {
    expect(validateAttachment({ fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 0 }).ok).toBe(false)
    expect(validateAttachment({ fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: -1 }).ok).toBe(false)
    expect(validateAttachment({ fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: Number.NaN }).ok).toBe(
      false,
    )
  })

  it('白名单覆盖 PRD 常见类型（Office 三件套 / 常见图片 / 文本 / ZIP / PDF）', () => {
    const allowed = [
      'application/pdf',
      'application/zip',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'text/plain',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]
    allowed.forEach((mime) => expect(isAllowedMimeType(mime)).toBe(true))
  })

  it('MIME 判定大小写不敏感', () => {
    expect(isAllowedMimeType('IMAGE/PNG')).toBe(true)
    expect(isAllowedMimeType('Application/PDF')).toBe(true)
  })
})

describe('uploadAttachment —— 边界补强', () => {
  it('文件名为空 → 抛 42201 且不落库', async () => {
    const before = db.attachments.length
    await expect(
      taskService.uploadAttachment(
        'task-001',
        { fileName: '   ', mimeType: 'application/pdf', sizeBytes: 100 },
        ME,
      ),
    ).rejects.toMatchObject({ code: ERR_INVALID_ATTACHMENT })
    expect(db.attachments.length).toBe(before)
  })

  it('恰好 20MB（边界值）通过并落库', async () => {
    const attachment = await taskService.uploadAttachment(
      'task-001',
      { fileName: 'edge.pdf', mimeType: 'application/pdf', sizeBytes: ATTACHMENT_MAX_SIZE_BYTES },
      ME,
    )
    expect(db.attachments.some((item) => item.id === attachment.id)).toBe(true)
  })

  it('进度回调按分片递增且最终为 1（驱动 UI 线性进度条）', async () => {
    const progress: number[] = []
    await taskService.uploadAttachment(
      'task-001',
      { fileName: '进度.pdf', mimeType: 'application/pdf', sizeBytes: 1024 },
      ME,
      (ratio) => progress.push(ratio),
    )
    expect(progress.length).toBeGreaterThanOrEqual(4)
    // 单调不减
    progress.forEach((value, index) => {
      if (index > 0) expect(value).toBeGreaterThanOrEqual(progress[index - 1])
    })
    expect(progress[progress.length - 1]).toBe(1)
  })
})
