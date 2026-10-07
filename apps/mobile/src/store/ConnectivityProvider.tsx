/**
 * 职责：连通性独立 Provider（增量 8 · Q7 / Q1 / Q12）。
 *
 * 桥接 `services/connectivity` 单例到 React 状态，并编排三条主动恢复路径：
 * ① 用户重试（横幅「重试」）② `AppState` 回前台 ③ 离线期间退避探测（5s→10s→30s 封顶）。
 * 恢复刷新经 `scheduleRefresh()` 做 **1s 尾沿节流合并**（Q12）；`offline → online` 转变触发一次
 * 「已刷新」轻提示（`RefreshToast`）。
 *
 * 说明：连通性是**设备态**，不进 `AppProvider`（Q7）；`RefreshToast` 由本 Provider 直接渲染
 * （它需要本 Provider 的状态），`OfflineBanner` 由 `App.tsx` 渲染（同为消费方）。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { RefreshToast } from '@/components/RefreshToast'
import * as connectivity from '@/services/connectivity'
import type { OfflineReason } from '@/services/connectivity'
import { useT } from '@/store/I18nProvider'

/** 连通性上下文取值 */
export interface ConnectivityContextValue {
  /** 是否处于离线态 */
  isOffline: boolean
  /** 离线原因（`network` = 无网络，`server` = 服务暂时不可用） */
  reason: OfflineReason
  /** 手动重试：触发一次全屏刷新（节流合并） */
  retryNow: () => void
  /** 设置「模拟离线」开关（Q2） */
  setSimulatedOffline: (value: boolean) => void
}

const ConnectivityContext = createContext<ConnectivityContextValue | null>(null)

/** 恢复刷新节流窗口（毫秒，Q12：1s 尾沿合并） */
const REFRESH_THROTTLE_MS = 1000
/** 退避探测间隔（毫秒，5s → 10s → 30s 封顶） */
const PROBE_DELAYS_MS = [5000, 10000, 30000] as const
/** 「已刷新」轻提示展示时长（毫秒） */
const REFRESH_TOAST_MS = 2000

/** 连通性 Provider */
export function ConnectivityProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [isOffline, setIsOffline] = useState<boolean>(connectivity.isOffline())
  const [reason, setReason] = useState<OfflineReason>(connectivity.getReason())
  const [toastVisible, setToastVisible] = useState(false)

  /** 节流定时器（尾沿：窗口内多次触发只刷一次） */
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 退避探测定时器 */
  const probeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 退避探测步进（复位时机：转在线 / 重新进入离线） */
  const probeStepRef = useRef(0)
  /** 取词：「已刷新」轻提示随语言切换（增量 12 · 此前为硬编码中文，绕过 RefreshToast 的 i18n） */
  const t = useT()

  /** 触发一次全屏刷新（1s 尾沿节流合并） */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) return
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null
      connectivity.refetchAll()
    }, REFRESH_THROTTLE_MS)
  }, [])

  /** 手动重试（路径①） */
  const retryNow = useCallback(() => {
    scheduleRefresh()
  }, [scheduleRefresh])

  /** 模拟离线开关（Q2）：置位后立即刷新；复位后刷新 → 请求成功 → 自然转在线 */
  const setSimulatedOffline = useCallback(
    (value: boolean) => {
      connectivity.setSimulatedOffline(value)
      scheduleRefresh()
    },
    [scheduleRefresh],
  )

  // ── 订阅连通性单例状态 ───────────────────────────────────────────
  useEffect(() => {
    return connectivity.subscribeStatus((nextStatus, nextReason) => {
      setIsOffline(nextStatus === 'offline')
      setReason(nextReason)
    })
  }, [])

  // ── 路径②：App 回前台时（若离线）尝试一次刷新 ─────────────────────
  useEffect(() => {
    const handleAppState = (next: AppStateStatus) => {
      if (next === 'active' && connectivity.isOffline()) scheduleRefresh()
    }
    const subscription = AppState.addEventListener('change', handleAppState)
    return () => {
      subscription.remove()
    }
  }, [scheduleRefresh])

  // ── 路径③：离线期间退避探测（5s → 10s → 30s 封顶），转在线即停止复位 ──
  const scheduleProbe = useCallback(() => {
    const step = Math.min(probeStepRef.current, PROBE_DELAYS_MS.length - 1)
    probeTimerRef.current = setTimeout(() => {
      probeStepRef.current += 1
      scheduleRefresh()
      if (connectivity.isOffline()) scheduleProbe()
    }, PROBE_DELAYS_MS[step])
  }, [scheduleRefresh])

  useEffect(() => {
    if (isOffline) {
      probeStepRef.current = 0
      scheduleProbe()
      return () => {
        if (probeTimerRef.current) clearTimeout(probeTimerRef.current)
        probeStepRef.current = 0
      }
    }
    if (probeTimerRef.current) clearTimeout(probeTimerRef.current)
    probeStepRef.current = 0
  }, [isOffline, scheduleProbe])

  // ── offline → online 转变：触发「已刷新」提示 + 全屏刷新 ─────────────
  const wasOfflineRef = useRef(isOffline)
  useEffect(() => {
    const recovered = wasOfflineRef.current && !isOffline
    wasOfflineRef.current = isOffline
    if (!recovered) return
    setToastVisible(true)
    scheduleRefresh()
  }, [isOffline, scheduleRefresh])

  // ── 卸载清理 ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      if (probeTimerRef.current) clearTimeout(probeTimerRef.current)
    }
  }, [])

  const value = useMemo<ConnectivityContextValue>(
    () => ({ isOffline, reason, retryNow, setSimulatedOffline }),
    [isOffline, reason, retryNow, setSimulatedOffline],
  )

  return (
    <ConnectivityContext.Provider value={value}>
      {children}
      <RefreshToast
        visible={toastVisible}
        message={t('component.refreshToast.message')}
        durationMs={REFRESH_TOAST_MS}
        onHide={() => setToastVisible(false)}
      />
    </ConnectivityContext.Provider>
  )
}

/** 读取连通性上下文（必须在 `ConnectivityProvider` 内使用） */
export function useConnectivity(): ConnectivityContextValue {
  const context = useContext(ConnectivityContext)
  if (!context) {
    throw new Error('useConnectivity 必须在 <ConnectivityProvider> 内部使用')
  }
  return context
}
