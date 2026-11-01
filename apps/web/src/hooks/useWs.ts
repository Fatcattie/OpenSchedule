/**
 * WS 实时刷新（R6-4 / §3.2）：socket.io-client 单例连接 + 事件订阅。
 * - 连接在有 access token 时建立（握手鉴权 = Bearer，与 HTTP 同口径；token 刷新后自动重建）；
 * - 登出即断开；连接失败不阻塞页面（后端未就绪时页面仍走 HTTP 手动刷新，§3.2 降级语义）；
 * - 开发环境经 vite proxy /socket.io 转发到主后端；生产需反向代理转发 websocket upgrade。
 */
import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useAuthStore } from '@/stores/authStore'

/** 服务端广播的领域事件帧名（= domain-events 事件名，Outbox 重放 → EventBus → WsGateway 广播） */
export const WS_EVENT_KEYS = [
  'task.created',
  'task.assigned',
  'task.status_changed',
  'task.completed',
  'task.comment_created',
  'mention.parsed',
] as const

export type WsEventKey = (typeof WS_EVENT_KEYS)[number]

/** 广播帧形（服务端 WsGateway.buildWsFrame：{event, payload, sentAt}） */
export interface WsEventFrame {
  event: string
  payload: Record<string, unknown>
  sentAt: string
}

let sharedSocket: Socket | null = null
let sharedSocketToken: string | null = null

/** 全局单例 socket（同 token 复用；token 变化/登出时重建或断开） */
export function getWsSocket(accessToken: string | null): Socket | null {
  if (!accessToken) {
    sharedSocket?.disconnect()
    sharedSocket = null
    sharedSocketToken = null
    return null
  }
  if (!sharedSocket || sharedSocketToken !== accessToken) {
    sharedSocket?.disconnect()
    sharedSocket = io({
      path: '/socket.io',
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    })
    sharedSocketToken = accessToken
  }
  return sharedSocket
}

/**
 * 订阅服务端 WS 广播（组件卸载只退订，不断开共享连接）。
 * @param onEvent 事件回调（event = 帧名，payload = §8.1 信封字段：tenantId/taskId/projectId/actor…）
 * @param enabled 默认 true；未登录（accessToken 为空）不建立连接
 */
export function useWsEvents(onEvent: (event: string, payload: Record<string, unknown>) => void, enabled = true): void {
  const accessToken = useAuthStore((s) => s.accessToken)
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  useEffect(() => {
    if (!enabled) return
    const socket = getWsSocket(accessToken)
    if (!socket) return

    const handler = (payload: unknown) => {
      const frame = payload as WsEventFrame | undefined
      // 帧形：socket.io 事件名 = 领域事件名，data = 广播帧 {event, payload, sentAt}
      handlerRef.current(frame?.event ?? 'unknown', (frame?.payload ?? {}) as Record<string, unknown>)
    }
    for (const key of WS_EVENT_KEYS) socket.on(key, handler)

    return () => {
      for (const key of WS_EVENT_KEYS) socket.off(key, handler)
    }
  }, [accessToken, enabled])
}
