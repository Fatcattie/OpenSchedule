/**
 * 职责：计时器 hook —— 开始 / 暂停 / 结束，累计秒数本地持久化，
 * 退出页面或杀进程后重进可恢复计时（ARCH T04 验收标准）。
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { taskService } from '@/services'

/** 计时状态持久化 key 前缀 */
const TIMER_STORAGE_PREFIX = 'os.timer.'

/** 持久化的计时状态 */
interface PersistedTimer {
  /** 当前进行中的工时记录 id（null = 未在计时） */
  entryId: string | null
  /** 当前计时段开始时刻（ISO） */
  startedAt: string | null
  /** 已累计秒数（此前各段之和） */
  baseSeconds: number
  /** 是否正在计时 */
  running: boolean
}

/** 初始计时状态 */
const INITIAL_TIMER: PersistedTimer = {
  entryId: null,
  startedAt: null,
  baseSeconds: 0,
  running: false,
}

/** useTimer 返回值 */
export interface UseTimerResult {
  /** 是否正在计时 */
  running: boolean
  /** 累计秒数（实时跳动） */
  seconds: number
  /** 当前工时记录 id */
  entryId: string | null
  /** 是否处于持久化状态恢复中 */
  restoring: boolean
  /** 请求进行中（禁用按钮防重复点击） */
  busy: boolean
  /** 开始 / 继续计时 */
  start: () => Promise<void>
  /** 暂停计时（保留累计秒数） */
  pause: () => Promise<void>
  /** 结束计时（清零本地累计，工时已落库） */
  stop: () => Promise<void>
  /** 重置本地计时状态（不写库） */
  reset: () => Promise<void>
}

/**
 * 任务计时器。
 * @param taskId 任务 id
 * @param userId 计时人 id
 */
export function useTimer(taskId: string, userId: string): UseTimerResult {
  const storageKey = `${TIMER_STORAGE_PREFIX}${taskId}`
  const [state, setState] = useState<PersistedTimer>(INITIAL_TIMER)
  const [restoring, setRestoring] = useState(true)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const stateRef = useRef(state)
  stateRef.current = state

  // 恢复上次计时状态
  useEffect(() => {
    let cancelled = false
    const restore = async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey)
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw) as PersistedTimer
          setState({
            entryId: parsed.entryId ?? null,
            startedAt: parsed.startedAt ?? null,
            baseSeconds: typeof parsed.baseSeconds === 'number' ? parsed.baseSeconds : 0,
            running: Boolean(parsed.running),
          })
        }
      } catch {
        // 忽略：损坏数据按未计时处理
      } finally {
        if (!cancelled) setRestoring(false)
      }
    }
    void restore()
    return () => {
      cancelled = true
    }
  }, [storageKey])

  // 计时中每秒触发重算
  useEffect(() => {
    if (!state.running) return
    const interval = setInterval(() => setTick((value) => value + 1), 1000)
    return () => clearInterval(interval)
  }, [state.running])

  const persist = useCallback(
    async (next: PersistedTimer) => {
      setState(next)
      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // 忽略：持久化失败不阻断计时
      }
    },
    [storageKey],
  )

  /** 累计秒数（基础秒 + 当前段已过秒） */
  const seconds = useMemo(() => {
    if (!state.running || !state.startedAt) return state.baseSeconds
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 1000))
    return state.baseSeconds + elapsed
    // tick 仅用于驱动重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.baseSeconds, state.running, state.startedAt, tick])

  const start = useCallback(async () => {
    if (stateRef.current.running) return
    setBusy(true)
    try {
      const entry = await taskService.startTimer(taskId, userId)
      await persist({
        entryId: entry.id,
        startedAt: entry.startedAt,
        baseSeconds: stateRef.current.baseSeconds,
        running: true,
      })
    } finally {
      setBusy(false)
    }
  }, [persist, taskId, userId])

  const pause = useCallback(async () => {
    const current = stateRef.current
    if (!current.running) return
    setBusy(true)
    try {
      if (current.entryId) await taskService.stopTimer(current.entryId)
      await persist({
        entryId: null,
        startedAt: null,
        baseSeconds: seconds,
        running: false,
      })
    } finally {
      setBusy(false)
    }
  }, [persist, seconds])

  const stop = useCallback(async () => {
    const current = stateRef.current
    setBusy(true)
    try {
      if (current.entryId) await taskService.stopTimer(current.entryId)
      await persist(INITIAL_TIMER)
    } finally {
      setBusy(false)
    }
  }, [persist])

  const reset = useCallback(async () => {
    await persist(INITIAL_TIMER)
  }, [persist])

  return { running: state.running, seconds, entryId: state.entryId, restoring, busy, start, pause, stop, reset }
}
