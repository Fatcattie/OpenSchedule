/**
 * 职责：附件 API 封装 —— POST /attachments（FormData 上传）、GET /attachments/:id（附件详情 + 预签名下载 URL）
 * 契约（以后端为准）：上传必须携带 resource_type/resource_id 表单字段；
 * 响应字段 camelCase：POST → {id,resourceType,resourceId,objectKey,fileName,mimeType,sizeBytes,createdAt}，
 * GET → 嵌套 {attachment:{...}, downloadUrl, expiresAt}，下载用 downloadUrl（5 分钟时效）。
 */
import { client } from './client'
import { mockOr } from './mock/dispatch'
import type { ApiResponse } from '@/types'

/** 附件挂载资源类型（schema attachments.resource_type：task/comment/project） */
export type AttachmentResourceType = 'task' | 'comment' | 'project'

/** 附件元数据（POST /attachments 响应；objectKey=对象存储 key、sizeBytes=字节数，与后端字段一致） */
export interface Attachment {
  id: string
  resourceType: AttachmentResourceType
  resourceId: string
  objectKey: string // 对象存储 key（S3/MinIO）
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

/** GET /attachments/:id 响应：嵌套 attachment（不含 objectKey）+ 临时下载 URL + 过期时间 */
export interface AttachmentDownload {
  attachment: Omit<Attachment, 'objectKey'>
  downloadUrl: string // 预签名下载地址（5 分钟时效），下载/预览直接用该地址
  expiresAt: string
}

/** 上传附件：POST /attachments（multipart/form-data：file=文件本体 + resource_type + resource_id） */
export async function uploadAttachment(
  file: File,
  resourceType: AttachmentResourceType,
  resourceId: string,
): Promise<Attachment> {
  return mockOr('mockUploadAttachment', async () => {
    const form = new FormData()
    form.append('file', file)
    form.append('resource_type', resourceType)
    form.append('resource_id', resourceId)
    const resp = await client.post<ApiResponse<Attachment>>('/attachments', form)
    return resp.data.data
  }, file, resourceType, resourceId)
}

/** 附件详情：GET /attachments/:id（响应含 downloadUrl 预签名地址，可直接用于下载/预览） */
export async function getAttachment(id: string): Promise<AttachmentDownload> {
  return mockOr('mockGetAttachment', async () => {
    const resp = await client.get<ApiResponse<AttachmentDownload>>(`/attachments/${id}`)
    return resp.data.data
  }, id)
}