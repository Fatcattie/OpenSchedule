/**
 * 自动化规则 API（B20）
 */
import { client } from './client'
import { mockOr } from './mock/dispatch'
import type { ApiResponse } from '@/types'
import type { AutomationRule, RuleTemplate, TriggerResult } from '@/types'

export interface ListRulesParams {
  projectId?: string
  triggerType?: string
  isEnabled?: boolean
}

export interface CreateRuleInput {
  name: string
  description?: string
  projectId?: string
  triggerType: string
  triggerConfig?: any
  conditionConfig?: any
  actions: any[]
  isEnabled?: boolean
}

/** 规则列表：GET /automation/rules */
export async function listRules(params: ListRulesParams = {}): Promise<AutomationRule[]> {
  return mockOr('mockListRules', async () => {
    const query: any = {}
    if (params.projectId) query.projectId = params.projectId
    if (params.triggerType) query.triggerType = params.triggerType
    if (params.isEnabled != null) query.isEnabled = String(params.isEnabled)
    const resp = await client.get<ApiResponse<AutomationRule[]>>('/automation/rules', { params: query })
    return resp.data.data as any
  }, params)
}

/** 规则详情：GET /automation/rules/:id */
export async function getRule(id: string): Promise<AutomationRule> {
  return mockOr('mockGetRule', async () => {
    const resp = await client.get<ApiResponse<AutomationRule>>(`/automation/rules/${id}`)
    return resp.data.data
  }, id)
}

/** 创建规则：POST /automation/rules */
export async function createRule(input: CreateRuleInput): Promise<AutomationRule> {
  return mockOr('mockCreateRule', async () => {
    const resp = await client.post<ApiResponse<AutomationRule>>('/automation/rules', input)
    return resp.data.data
  }, input)
}

/** 更新规则：PUT /automation/rules/:id */
export async function updateRule(id: string, input: Partial<CreateRuleInput>): Promise<AutomationRule> {
  return mockOr('mockUpdateRule', async () => {
    const resp = await client.put<ApiResponse<AutomationRule>>(`/automation/rules/${id}`, input)
    return resp.data.data
  }, id, input)
}

/** 删除规则：DELETE /automation/rules/:id */
export async function deleteRule(id: string): Promise<{ id: string; deleted: boolean }> {
  return mockOr('mockDeleteRule', async () => {
    const resp = await client.delete<ApiResponse<{ id: string; deleted: boolean }>>(`/automation/rules/${id}`)
    return resp.data.data
  }, id)
}

/** 启停规则：POST /automation/rules/:id/toggle */
export async function toggleRule(id: string, isEnabled: boolean): Promise<{ id: string; isEnabled: boolean }> {
  return mockOr('mockToggleRule', async () => {
    const resp = await client.post<ApiResponse<{ id: string; isEnabled: boolean }>>(
      `/automation/rules/${id}/toggle`,
      { isEnabled },
    )
    return resp.data.data
  }, id, isEnabled)
}

/** 手动触发测试：POST /automation/rules/:id/trigger */
export async function triggerRule(id: string, taskId: string): Promise<TriggerResult> {
  return mockOr('mockTriggerRule', async () => {
    const resp = await client.post<ApiResponse<TriggerResult>>(`/automation/rules/${id}/trigger`, { taskId })
    return resp.data.data
  }, id, taskId)
}

/** 预设模板：GET /automation/templates */
export async function listTemplates(): Promise<RuleTemplate[]> {
  return mockOr('mockListRuleTemplates', async () => {
    const resp = await client.get<ApiResponse<RuleTemplate[]>>('/automation/templates')
    return resp.data.data as any
  })
}

export const automationApi = {
  listRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  toggleRule,
  triggerRule,
  listTemplates,
}