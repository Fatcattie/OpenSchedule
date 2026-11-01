/**
 * useWorkspaceState — 工作台存储（D-07 一期）真实模式回归
 *
 * 覆盖：首屏加载解码、同集合多实例共享、乐观更新 + 只传差量、baseVersion 串行推进、
 * 冲突 40901 提示并回拉服务器数据、未加载完就写时基于服务器数据应用（不覆盖已有数据）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('@/api/config', () => ({
  API_BASE: '/api/v1',
  USE_MOCK: false,
  TOKEN_STORAGE_KEYS: { access: 'os.access_token', refresh: 'os.refresh_token' },
}))

vi.mock('@/api/workspaceApi', () => ({
  listWorkspaceItems: vi.fn(),
  applyWorkspaceBatch: vi.fn(),
}))

vi.mock('antd', () => ({
  message: { warning: vi.fn(), error: vi.fn() },
}))

import { message } from 'antd'
import { ApiClientError } from '@/api/errors'
import { applyWorkspaceBatch, listWorkspaceItems, type WorkspaceBatchInput } from '@/api/workspaceApi'
import { resetWorkspaceSyncState, useWorkspaceState } from '@/hooks/useWorkspaceState'

const list = vi.mocked(listWorkspaceItems)
const apply = vi.mocked(applyWorkspaceBatch)

interface Item {
  id: string
  title: string
}

let client: QueryClient
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/** 回显式批量写：新建 version=1，更新 baseVersion+1 */
function echoApply() {
  apply.mockImplementation(async (_c: string, input: WorkspaceBatchInput) => ({
    items: (input.upserts ?? []).map((u) => ({ key: u.key, version: (u.baseVersion ?? 0) + 1 })),
    deleted: (input.deletes ?? []).map((d) => d.key),
  }))
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  resetWorkspaceSyncState()
  list.mockReset()
  apply.mockReset()
  vi.mocked(message.warning).mockReset()
})

afterEach(() => {
  client.clear()
})

describe('useWorkspaceState（真实模式）', () => {
  it('加载服务器条目并按顺序表解码；ready 置位', async () => {
    list.mockResolvedValue([
      { key: '__order__', data: ['b', 'a'], version: 1 },
      { key: 'a', data: { id: 'a', title: 'A' }, version: 3 },
      { key: 'b', data: { id: 'b', title: 'B' }, version: 1 },
    ])
    const { result } = renderHook(() => useWorkspaceState<Item[]>('tasks', []), { wrapper })
    expect(result.current[2].ready).toBe(false)
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    expect(result.current[0].map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('集合从未写过 → 显示 initial，且不自动写回', async () => {
    list.mockResolvedValue([])
    const { result } = renderHook(() => useWorkspaceState<string[]>('calendar_synced_refs', () => ['x']), { wrapper })
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    expect(result.current[0]).toEqual(['x'])
    expect(apply).not.toHaveBeenCalled()
  })

  it('改一条：乐观更新、两实例同步、只上传该条目并携带服务器版本', async () => {
    list.mockResolvedValue([
      { key: '__order__', data: ['a', 'b'], version: 1 },
      { key: 'a', data: { id: 'a', title: 'A' }, version: 3 },
      { key: 'b', data: { id: 'b', title: 'B' }, version: 1 },
    ])
    echoApply()
    const { result } = renderHook(
      () => ({ one: useWorkspaceState<Item[]>('tasks', []), two: useWorkspaceState<Item[]>('tasks', []) }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.one[2].ready).toBe(true))
    act(() => {
      result.current.one[1]((cur) => cur.map((i) => (i.id === 'a' ? { ...i, title: 'A2' } : i)))
    })
    await waitFor(() => expect(result.current.two[0][0].title).toBe('A2'))
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1))
    expect(apply).toHaveBeenCalledWith('tasks', {
      upserts: [{ key: 'a', data: { id: 'a', title: 'A2' }, baseVersion: 3 }],
      deletes: [],
    })
  })

  it('连续两次写同一条：第二次的 baseVersion 取第一次提交后的新版本', async () => {
    list.mockResolvedValue([])
    echoApply()
    const { result } = renderHook(() => useWorkspaceState<Item[]>('tasks', []), { wrapper })
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    act(() => {
      result.current[1]([{ id: 'a', title: '1' }])
      result.current[1]((cur) => cur.map((i) => ({ ...i, title: '2' })))
    })
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(2))
    const second = apply.mock.calls[1][1]
    expect(second.upserts).toEqual([{ key: 'a', data: { id: 'a', title: '2' }, baseVersion: 1 }])
  })

  it('冲突 40901：提示并回拉服务器数据覆盖乐观值', async () => {
    list.mockResolvedValueOnce([{ key: '__value__', data: { pushEnabled: true }, version: 1 }])
    let rejectApply!: (e: unknown) => void
    apply.mockImplementationOnce(() => new Promise((_r, rej) => { rejectApply = rej }))
    const { result } = renderHook(() => useWorkspaceState<{ pushEnabled: boolean }>('calendar_sync_settings', { pushEnabled: false }), {
      wrapper,
    })
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    list.mockResolvedValueOnce([{ key: '__value__', data: { pushEnabled: true }, version: 2 }])
    act(() => {
      result.current[1]({ pushEnabled: false })
    })
    await waitFor(() => expect(result.current[0].pushEnabled).toBe(false))
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1))
    await act(async () => {
      rejectApply(new ApiClientError(40901, 'conflict', [], 409))
    })
    await waitFor(() => expect(message.warning).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current[0].pushEnabled).toBe(true))
  })

  it('首屏未加载完就写：先拉服务器数据再基于它应用，不覆盖已有条目', async () => {
    let resolveList!: (v: Awaited<ReturnType<typeof listWorkspaceItems>>) => void
    list.mockImplementation(() => new Promise((r) => { resolveList = r }))
    echoApply()
    const { result } = renderHook(() => useWorkspaceState<Item[]>('wiki_kb', []), { wrapper })
    act(() => {
      result.current[1]((cur) => (cur.length === 0 ? [{ id: 'seed', title: 'S' }] : cur))
    })
    await act(async () => {
      resolveList([
        { key: '__order__', data: ['x'], version: 1 },
        { key: 'x', data: { id: 'x', title: 'X' }, version: 1 },
      ])
    })
    await waitFor(() => expect(result.current[2].ready).toBe(true))
    expect(result.current[0]).toEqual([{ id: 'x', title: 'X' }])
    expect(apply).not.toHaveBeenCalled()
  })
})
