/**
 * useTaskReview — 工作台审核命令（D-07 二期）前端入口
 * 覆盖：真实模式走 POST 审核命令并返回结果；失败弹出服务端原因并返回 null；审核结果并入任务列表。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('@/api/config', () => ({
  API_BASE: '/api/v1',
  USE_MOCK: false,
  TOKEN_STORAGE_KEYS: { access: 'os.access_token', refresh: 'os.refresh_token' },
}))
vi.mock('@/api/workspaceApi', () => ({
  reviewWorkspaceTask: vi.fn(),
  listWorkspaceItems: vi.fn(),
  applyWorkspaceBatch: vi.fn(),
  getWorkspaceDirectory: vi.fn(),
}))
vi.mock('@/hooks/useCurrentRole', () => ({ useCurrentRole: () => 'manager' }))
vi.mock('antd', () => ({ message: { error: vi.fn(), warning: vi.fn() } }))

import { message } from 'antd'
import { ApiClientError } from '@/api/errors'
import { reviewWorkspaceTask } from '@/api/workspaceApi'
import { mergeReviewResult, useTaskReview } from '@/hooks/useTaskReview'

const review = vi.mocked(reviewWorkspaceTask)

beforeEach(() => {
  review.mockReset()
  vi.mocked(message.error).mockReset()
})

describe('useTaskReview（真实模式）', () => {
  it('调用审核命令并返回服务端结果', async () => {
    review.mockResolvedValue({ taskId: 't1', action: 'approve', approvalStatus: 'approved', generated: 2, sopArchived: false })
    const { result } = renderHook(() => useTaskReview())
    const res = await result.current('t1', { action: 'approve', opinion: 'agree' })
    expect(review).toHaveBeenCalledWith('t1', { action: 'approve', opinion: 'agree' })
    expect(res).toMatchObject({ approvalStatus: 'approved', generated: 2 })
  })

  it('服务端拒绝：弹出原因并返回 null（调用方保留弹窗）', async () => {
    review.mockRejectedValue(new ApiClientError(40301, '只有管理人员可以审核', [], 403))
    const { result } = renderHook(() => useTaskReview())
    const res = await result.current('t1', { action: 'approve', opinion: 'agree' })
    expect(res).toBeNull()
    expect(message.error).toHaveBeenCalledWith('只有管理人员可以审核')
  })
})

describe('mergeReviewResult', () => {
  it('替换修改项、移除删除项、新建项置顶', () => {
    const list = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'c', v: 1 }]
    const merged = mergeReviewResult(list, {
      upserts: [{ id: 'a', v: 2 }, { id: 'n1' }, { id: 'n2' }],
      deletes: ['c'],
      prepend: ['n1', 'n2'],
      sopDoc: null,
    })
    expect(merged.map((t) => t.id)).toEqual(['n1', 'n2', 'a', 'b'])
    expect(merged[2]).toEqual({ id: 'a', v: 2 })
  })
})
