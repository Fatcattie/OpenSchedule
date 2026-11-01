import { useEffect, useRef, useState } from 'react'

const PREFIX = 'os_ws_v1_'
const LS_SYNC_EVENT = 'os_ls_sync_'

/**
 * 与 localStorage 同步的 state hook。
 * 用于 mock 演示模式下的数据持久化，使刷新页面后用户测试数据不丢失。
 * 同一页面多个实例（如顶栏与页面）通过自定义事件实时同步，跨标签页通过 storage 事件同步。
 * 接入真实后端后，这些状态应改为由接口读写，本 hook 仅作为离线演示兜底。
 */
export function useLocalStorageState<T>(
  key: string,
  initial: T | (() => T),
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = PREFIX + key
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw != null) return JSON.parse(raw) as T
    } catch {
      // 解析失败时回退到初始值
    }
    return typeof initial === 'function' ? (initial as () => T)() : initial
  })
  // 记录本实例最近一次写入的 JSON，供同步回调跳过「自己写自己」的重复 setState
  const lastWrittenRef = useRef<string | null>(null)

  useEffect(() => {
    try {
      const str = JSON.stringify(state)
      localStorage.setItem(storageKey, str)
      lastWrittenRef.current = str
    } catch {
      // 忽略写入异常（如隐私模式或配额超限）
    }
    window.dispatchEvent(new Event(LS_SYNC_EVENT + storageKey))
  }, [storageKey, state])

  useEffect(() => {
    const readAndSet = () => {
      try {
        const raw = localStorage.getItem(storageKey)
        if (raw == null || raw === lastWrittenRef.current) return
        setState(JSON.parse(raw))
      } catch {
        // 解析失败忽略
      }
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey) readAndSet()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(LS_SYNC_EVENT + storageKey, readAndSet)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(LS_SYNC_EVENT + storageKey, readAndSet)
    }
  }, [storageKey])

  return [state, setState]
}

/** 非组件代码命令式读取（解析失败或不存在返回 fallback） */
export function readLocalStorageState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw != null) return JSON.parse(raw) as T
  } catch {
    // 解析失败回退 fallback
  }
  return fallback
}

/**
 * 非组件代码命令式写入（如 SOP 沉淀工具）：读当前值 → updater → 写回，并通知已挂载的 hook 实例同步。
 */
export function writeLocalStorageState<T>(key: string, updater: (prev: T) => T, fallback: T): void {
  const storageKey = PREFIX + key
  let prev = fallback
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw != null) prev = JSON.parse(raw) as T
  } catch {
    // 解析失败回退 fallback
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify(updater(prev)))
  } catch {
    // 忽略写入异常
  }
  window.dispatchEvent(new Event(LS_SYNC_EVENT + storageKey))
}

/** 清空当前工作台所有持久化数据（用于重置演示）。 */
export function clearWorkspaceStorage(): void {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX)) keys.push(k)
  }
  keys.forEach((k) => localStorage.removeItem(k))
}
