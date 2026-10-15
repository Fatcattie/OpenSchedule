/**
 * 职责：附件 multipart 上传路径单测（增量 11 · T03）。
 *
 * 覆盖本增量最容易踩的坑与最关键的契约：
 * - `postMultipart` **绝不手设 `Content-Type`**（手设会丢 boundary，服务端 multer 解析必失败）；
 * - 请求形态：URL / method / Authorization / body 为 FormData；
 * - `buildAttachmentFormData` 的字段名对齐后端 `UploadAttachmentDto`（`file` / `resource_type` / `resource_id`）；
 * - `mapUploadedAttachment` 补齐服务端响应缺失的 `tenantId` / `uploaderId`；
 * - 真实分支前置守卫：既无 File 也无 uri ⇒ 抛错且不发起请求。
 *
 * 注：`USE_MOCK` 在 `src/services/config.ts:12` 于**模块加载期**求值，
 * 故真实分支用例需在设置 `process.env` 后 `jest.resetModules()` 重新加载模块。
 */
import { postMultipart } from '@/services/client'
import {
  buildAttachmentFormData,
  mapUploadedAttachment,
  type UploadAttachmentInput,
} from '@/services/task.service'
import type { AttachmentFileMeta } from '@/utils/attachment'

/**
 * 捕获 `FormData.append` 的调用序列。
 *
 * 之所以用 spy 而非读 FormData 内部字段：jest 环境里 FormData 是**原生实现**，
 * 既无 `getParts()` 也无 `_parts`，且非 Blob 值（native 的 `{ uri, name, type }`）
 * 会被字符串化成 `"[object Object]"`，读不出来原始对象 —— 只有 spy 能拿到 append 的**原始入参**。
 */
function captureAppends<T>(run: () => T): { result: T; calls: Array<[string, unknown]> } {
  const spy = jest.spyOn(FormData.prototype, 'append')
  try {
    const result = run()
    return { result, calls: spy.mock.calls as unknown as Array<[string, unknown]> }
  } finally {
    spy.mockRestore()
  }
}

/** 构造一个最小可用的 fetch Response 替身 */
function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as unknown as Response
}

const META: AttachmentFileMeta = {
  fileName: '现场照.heic',
  mimeType: 'image/heic',
  sizeBytes: 2048,
}

describe('postMultipart —— multipart 请求形态', () => {
  const originalFetch = global.fetch
  let fetchMock: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(jsonResponse({ code: 0, data: { ok: true } }))
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('命中正确的 URL 与 POST 方法', async () => {
    await postMultipart('/attachments', new FormData())
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/attachments')
    expect(init.method).toBe('POST')
  })

  it('绝不手设 Content-Type（boundary 必须由运行时自动附加）', async () => {
    await postMultipart('/attachments', new FormData())
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
    expect(headers.ContentType).toBeUndefined()
    // Accept 仍在（JSON 响应）
    expect(headers.Accept).toBe('application/json')
  })

  it('body 是 FormData 实例', async () => {
    const form = new FormData()
    await postMultipart('/attachments', form)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.body).toBe(form)
  })

  it('未注入 token 时不带 Authorization', async () => {
    await postMultipart('/attachments', new FormData())
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('把查询参数拼到 URL 上', async () => {
    await postMultipart('/attachments', new FormData(), {
      query: { resource_type: 'task', resource_id: 't-1' },
    })
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('resource_type=task')
    expect(url).toContain('resource_id=t-1')
  })

  it('解包信封：返回 envelope.data', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 0, data: { id: 'att-1' } }))
    await expect(postMultipart<{ id: string }>('/attachments', new FormData())).resolves.toEqual({ id: 'att-1' })
  })

  it('HTTP 失败抛 ApiError（网络层异常也一样归一化）', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 42201, message: '文件类型不在白名单内' }, 422))
    await expect(postMultipart('/attachments', new FormData())).rejects.toMatchObject({
      code: 42201,
      message: '文件类型不在白名单内',
    })
  })
})

describe('buildAttachmentFormData —— 字段名对齐后端 DTO', () => {
  it('含 file / resource_type / resource_id 三个字段', () => {
    const { calls } = captureAppends(() =>
      buildAttachmentFormData({ ...META, uri: 'file:///cache/a.heic' }, 'task', 'task-1'),
    )
    expect(calls.map(([name]) => name)).toEqual(['file', 'resource_type', 'resource_id'])
  })

  it('resource_type / resource_id 取传入值', () => {
    const { result } = captureAppends(() =>
      buildAttachmentFormData({ ...META, uri: 'file:///cache/a.heic' }, 'task', 'task-1'),
    )
    expect(result.get('resource_type')).toBe('task')
    expect(result.get('resource_id')).toBe('task-1')
  })

  it('native：无 File 时用 { uri, name, type } 描述本地文件', () => {
    const { calls } = captureAppends(() =>
      buildAttachmentFormData({ ...META, uri: 'file:///cache/IMG_0001.heic' }, 'task', 'task-1'),
    )
    const fileCall = calls.find(([name]) => name === 'file')
    expect(fileCall).toBeDefined()
    expect(fileCall?.[1]).toMatchObject({
      uri: 'file:///cache/IMG_0001.heic',
      name: '现场照.heic',
      type: 'image/heic',
    })
  })

  it('Web：有 File 时直接 append File 本体', () => {
    const file = new File(['x'], 'web.png', { type: 'image/png' })
    const { calls } = captureAppends(() =>
      buildAttachmentFormData({ ...META, fileName: 'web.png', file }, 'task', 'task-1'),
    )
    expect(calls.find(([name]) => name === 'file')?.[1]).toBe(file)
  })
})

describe('mapUploadedAttachment —— 补齐服务端响应缺失字段', () => {
  it('补齐 tenantId / uploaderId，其余字段原样透传', () => {
    const raw = {
      id: 'att-9',
      resourceType: 'task',
      resourceId: 'task-1',
      objectKey: 'tenant-001/task-1/现场照.heic',
      fileName: '现场照.heic',
      mimeType: 'image/heic',
      sizeBytes: 2048,
      createdAt: '2026-10-06T09:00:00.000Z',
    }
    const attachment = mapUploadedAttachment(raw, { tenantId: 'tenant-001', uploaderId: 'user-1' })
    expect(attachment.tenantId).toBe('tenant-001')
    expect(attachment.uploaderId).toBe('user-1')
    expect(attachment.fileName).toBe('现场照.heic')
    expect(attachment.mimeType).toBe('image/heic')
    expect(attachment.objectKey).toBe('tenant-001/task-1/现场照.heic')
  })
})

describe('uploadAttachment 真实分支（USE_MOCK=false）', () => {
  const originalEnv = process.env.EXPO_PUBLIC_USE_MOCK
  const originalFetch = global.fetch
  let fetchMock: jest.Mock

  /**
   * 把 `EXPO_PUBLIC_USE_MOCK` 置为 'false' 后**重新加载模块**，
   * 使 `config.ts` 的 `USE_MOCK` 求值为 false（它在模块加载期只读一次）。
   */
  function loadWithMockDisabled() {
    process.env.EXPO_PUBLIC_USE_MOCK = 'false'
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const svc = require('@/services/task.service') as typeof import('@/services/task.service')
    return svc
  }

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({
        code: 0,
        data: {
          id: 'att-1',
          resourceType: 'task',
          resourceId: 'task-1',
          objectKey: 'tenant-001/task-1/现场照.heic',
          fileName: '现场照.heic',
          mimeType: 'image/heic',
          sizeBytes: 2048,
          createdAt: '2026-10-06T09:00:00.000Z',
        },
      }),
    )
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    process.env.EXPO_PUBLIC_USE_MOCK = originalEnv
    global.fetch = originalFetch
    jest.resetModules()
  })

  it('真实分支走 multipart 并补齐 tenantId', async () => {
    const svc = loadWithMockDisabled()
    const input: UploadAttachmentInput = { ...META, uri: 'file:///cache/IMG_0001.heic' }
    const attachment = await svc.uploadAttachment('task-1', input, 'user-1', undefined, {
      tenantId: 'tenant-001',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/attachments')
    expect(init.method).toBe('POST')
    expect(attachment.tenantId).toBe('tenant-001')
    expect(attachment.uploaderId).toBe('user-1')
  })

  it('既无 File 也无 uri ⇒ 抛错且不发起请求', async () => {
    const svc = loadWithMockDisabled()
    const input: UploadAttachmentInput = { ...META }
    await expect(
      svc.uploadAttachment('task-1', input, 'user-1', undefined, { tenantId: 'tenant-001' }),
    ).rejects.toMatchObject({ code: 42201 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
