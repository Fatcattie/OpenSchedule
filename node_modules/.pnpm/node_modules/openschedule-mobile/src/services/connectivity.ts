/**
 * 职责：连通性被动推断单例（增量 8 · Q1）—— 零依赖，不进 React、不进 `AppProvider`。
 *
 * 它只回答一个问题：**最近一次真实请求的结果是否表明网络可用**。
 * - 离线信号：`notifyNetworkFailure(reason)`（由网络层在请求失败时调用）；
 * - 在线信号：`notifyNetworkSuccess()`（由网络层在请求成功时调用）；
 * - 恢复判据：一次请求不再失败（即收到 `notifyNetworkSuccess()`）即判定恢复。
 *
 * 另承载两件事：
 * - 「模拟离线」开关（Q2，验收前提）：`isSimulatedOffline()` / `setSimulatedOffline()`；
 * - 「全屏刷新注册表」（Q12）：`registerRefetcher()` / `refetchAll()`（`useAsync` 挂载期注册）。
 *
 * 设计约束：模块级单例状态机，无 React 依赖（`useAsync` 被用在 Provider 外也不得抛错）。
 */
export type NetworkStatus = 'online' | 'offline'
export type OfflineReason = 'network' | 'server'

/** 状态订阅回调 */
type StatusListener = (status: NetworkStatus, reason: OfflineReason) => void
/** 刷新注册项 */
type Refetcher = () => void

/** 当前状态（默认在线，避免冷启动误报离线） */
let status: NetworkStatus = 'online'
/** 当前离线原因（`network` = 无网络，`server` = 服务端异常），仅离线时有意义 */
let reason: OfflineReason = 'network'
/** 模拟离线标志（仅会话内，不落盘） */
let simulatedOffline = false

/** 状态订阅者（`ConnectivityProvider` 桥接到 React） */
const statusListeners = new Set<StatusListener>()
/** 全屏刷新注册表（各 `useAsync` 挂载期注册 run） */
const refetchers = new Set<Refetcher>()

/** 当前网络状态 */
export function getStatus(): NetworkStatus {
  return status
}

/** 当前离线原因（在线时返回最近一次离线原因，供文案兜底） */
export function getReason(): OfflineReason {
  return reason
}

/** 是否处于离线态 */
export function isOffline(): boolean {
  return status === 'offline'
}

/** 是否处于「模拟离线」态 */
export function isSimulatedOffline(): boolean {
  return simulatedOffline
}

/** 内部：更新状态并按需广播（仅在 `status` / `reason` 真正变化时通知） */
function setStatus(next: NetworkStatus, nextReason: OfflineReason): void {
  if (status === next && reason === nextReason) return
  status = next
  reason = nextReason
  statusListeners.forEach((listener) => listener(status, reason))
}

/** 上报：一次请求成功（在线信号 / 恢复判据） */
export function notifyNetworkSuccess(): void {
  setStatus('online', reason)
}

/** 上报：一次请求失败（离线信号），`nextReason` 区分无网络 / 服务端异常 */
export function notifyNetworkFailure(nextReason: OfflineReason): void {
  setStatus('offline', nextReason)
}

/**
 * 设置「模拟离线」开关（Q2）。
 * 打开时立即置为离线态（横幅即时出现）；关闭时**不**直接置在线，
 * 交由后续请求成功（`notifyNetworkSuccess()`）自然恢复。
 */
export function setSimulatedOffline(value: boolean): void {
  simulatedOffline = value
  if (value) notifyNetworkFailure('network')
}

/** 订阅状态变化，返回取消订阅函数 */
export function subscribeStatus(listener: StatusListener): () => void {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}

/** 注册一个全屏刷新函数，返回注销函数（`useAsync` 挂载期注册） */
export function registerRefetcher(refetch: Refetcher): () => void {
  refetchers.add(refetch)
  return () => {
    refetchers.delete(refetch)
  }
}

/** 触发全部已注册的刷新（恢复网络 / 手动重试 / 回前台 / 退避探测） */
export function refetchAll(): void {
  refetchers.forEach((refetch) => {
    refetch()
  })
}

/**
 * 测试辅助：复位模块状态（清空订阅者与注册表）。
 * 运行时不应调用；仅供单元测试隔离用例间状态。
 */
export function resetConnectivity(): void {
  status = 'online'
  reason = 'network'
  simulatedOffline = false
  statusListeners.clear()
  refetchers.clear()
}
