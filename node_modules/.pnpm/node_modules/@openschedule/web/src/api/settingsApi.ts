/**
 * settingsApi —— 开放 API 设置（B22）
 * 包含：API Keys 管理 + Webhook 管理
 */
import { client } from './client'
import { USE_MOCK } from './config'
import {
  mockListApiKeys,
  mockCreateApiKey,
  mockListWebhooks,
  mockGetWebhook,
  mockCreateWebhook,
  mockUpdateWebhook,
  mockTestWebhook,
  mockListWebhookEvents,
} from './mock/handlers'
import type { ApiResponse } from '@/types'
import type { ApiKey, Webhook, WebhookEvent, WebhookTestResult } from '@/types'

// ========== API Keys ==========

export interface CreateApiKeyInput {
  name: string
  scopes?: string[]
  expiresAt?: string
}

/** GET /api-keys */
export async function listApiKeys(): Promise<ApiKey[]> {
  if (USE_MOCK) return mockListApiKeys()
  const resp = await client.get<ApiResponse<ApiKey[]>>('/api-keys')
  return resp.data.data
}

/** POST /api-keys */
export async function createApiKey(input: CreateApiKeyInput): Promise<ApiKey & { secret: string }> {
  if (USE_MOCK) return mockCreateApiKey(input) as any
  const resp = await client.post<ApiResponse<ApiKey & { secret: string }>>('/api-keys', input)
  return resp.data.data
}

/** DELETE /api-keys/:id */
export async function revokeApiKey(id: string): Promise<{ id: string; revoked: boolean }> {
  if (USE_MOCK) return { id, revoked: true }
  const resp = await client.delete<ApiResponse<{ id: string; revoked: boolean }>>(`/api-keys/${id}`)
  return resp.data.data
}

// ========== Webhooks ==========

export interface CreateWebhookInput {
  name: string
  url: string
  events: string[]
  isActive?: boolean
}

export interface UpdateWebhookInput {
  name?: string
  url?: string
  events?: string[]
  isActive?: boolean
}

/** GET /webhooks/events */
export async function listWebhookEvents(): Promise<WebhookEvent[]> {
  if (USE_MOCK) return mockListWebhookEvents()
  const resp = await client.get<ApiResponse<WebhookEvent[]>>('/webhooks/events')
  return resp.data.data as any
}

/** GET /webhooks */
export async function listWebhooks(): Promise<Webhook[]> {
  if (USE_MOCK) return mockListWebhooks()
  const resp = await client.get<ApiResponse<Webhook[]>>('/webhooks')
  return resp.data.data as any
}

/** GET /webhooks/:id */
export async function getWebhook(id: string): Promise<Webhook> {
  if (USE_MOCK) return mockGetWebhook(id)
  const resp = await client.get<ApiResponse<Webhook>>(`/webhooks/${id}`)
  return resp.data.data
}

/** POST /webhooks */
export async function createWebhook(input: CreateWebhookInput): Promise<Webhook & { signingSecret: string }> {
  if (USE_MOCK) return mockCreateWebhook(input) as any
  const resp = await client.post<ApiResponse<Webhook & { signingSecret: string }>>('/webhooks', input)
  return resp.data.data
}

/** PUT /webhooks/:id */
export async function updateWebhook(id: string, input: UpdateWebhookInput): Promise<Webhook> {
  if (USE_MOCK) return mockUpdateWebhook(id, input)
  const resp = await client.put<ApiResponse<Webhook>>(`/webhooks/${id}`, input)
  return resp.data.data
}

/** DELETE /webhooks/:id */
export async function deleteWebhook(id: string): Promise<{ id: string; deleted: boolean }> {
  if (USE_MOCK) return { id, deleted: true }
  const resp = await client.delete<ApiResponse<{ id: string; deleted: boolean }>>(`/webhooks/${id}`)
  return resp.data.data
}

/** POST /webhooks/:id/toggle */
export async function toggleWebhook(id: string, isActive: boolean): Promise<{ id: string; isActive: boolean }> {
  if (USE_MOCK) return { id, isActive }
  const resp = await client.post<ApiResponse<{ id: string; isActive: boolean }>>(
    `/webhooks/${id}/toggle`,
    { isActive },
  )
  return resp.data.data
}

/** POST /webhooks/:id/test */
export async function testWebhook(id: string): Promise<WebhookTestResult> {
  if (USE_MOCK) return mockTestWebhook(id)
  const resp = await client.post<ApiResponse<WebhookTestResult>>(`/webhooks/${id}/test`)
  return resp.data.data
}

export const settingsApi = {
  // API Keys
  listApiKeys,
  createApiKey,
  revokeApiKey,
  // Webhooks
  listWebhookEvents,
  listWebhooks,
  getWebhook,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  toggleWebhook,
  testWebhook,
}
