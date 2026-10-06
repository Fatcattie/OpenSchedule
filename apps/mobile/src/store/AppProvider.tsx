/**
 * 职责：全局状态 Provider —— 会话 / 角色 / 偏好 / 乐观更新登记（ARCH §10 状态管理边界）。
 * 服务端数据不做全局缓存，由各页面 useAsync 局部持有；此处仅承载跨页共享的最小状态。
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
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
import {
  authService,
  clearAllCache,
  PREFERENCE_KEYS,
  setCacheScope,
  setTokenProvider,
  setUnauthorizedHandler,
  TOKEN_KEYS,
} from '@/services'
import type { LoginResult } from '@/services'
import { deleteSecureItem, getSecureItem, setSecureItem } from '@/services/platform/secureStore'
import type { AppRole, TaskStatus, TenantSummary, User } from '@/types'

/** 乐观更新登记项 */
export interface OptimisticEntry {
  id: string
  taskId: string
  from: TaskStatus
  to: TaskStatus
  createdAt: number
}

/** 本地偏好 */
export interface AppPreferences {
  /** 演示角色（纯前端切换） */
  role: AppRole
  /** 记住我 */
  rememberMe: boolean
  /** 已开启生物识别快捷解锁 */
  biometricEnabled: boolean
  /** 最近一次登录邮箱（记住我时回填） */
  lastEmail: string | null
}

/** 默认偏好 */
const DEFAULT_PREFERENCES: AppPreferences = {
  role: 'manager',
  rememberMe: false,
  biometricEnabled: false,
  lastEmail: null,
}

/** 全局上下文取值 */
export interface AppContextValue {
  /** 当前用户 */
  user: User | null
  /** 所属租户 */
  tenant: TenantSummary | null
  /** 后端返回的角色列表 */
  roles: string[]
  /** 演示角色 */
  role: AppRole
  /** 是否已登录 */
  isAuthenticated: boolean
  /** 是否处于冷启动恢复会话阶段 */
  isBootstrapping: boolean
  /** 本地偏好 */
  preferences: AppPreferences
  /** 乐观更新登记表 */
  optimistic: OptimisticEntry[]

  /** 写入会话（登录成功后调用） */
  signIn: (result: LoginResult, options?: { rememberMe?: boolean; biometricEnabled?: boolean }) => Promise<void>
  /** 退出登录（清理本地凭证与偏好） */
  signOut: () => Promise<void>
  /** 切换演示角色 */
  setRole: (role: AppRole) => Promise<void>
  /** 开启 / 关闭生物识别快捷解锁 */
  setBiometricEnabled: (enabled: boolean) => Promise<void>
  /** 重新拉取当前用户上下文 */
  refreshMe: () => Promise<void>

  /** 登记乐观更新，返回登记 id */
  pushOptimistic: (entry: { taskId: string; from: TaskStatus; to: TaskStatus }) => string
  /** 回滚乐观更新（撤销 / 写失败） */
  rollbackOptimistic: (id: string) => void
  /** 提交乐观更新（超时未撤销） */
  commitOptimistic: (id: string) => void
  /** 查询某任务是否处于乐观更新中 */
  findOptimistic: (taskId: string) => OptimisticEntry | null
}

const AppContext = createContext<AppContextValue | null>(null)

/** 乐观登记 id 序号 */
let optimisticSeq = 0

/** 全局状态 Provider */
export function AppProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [tenant, setTenant] = useState<TenantSummary | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES)
  const [optimistic, setOptimistic] = useState<OptimisticEntry[]>([])

  /** 供 client 同步读取 token（避免每次请求都触发 React 更新） */
  const tokenRef = useRef<string | null>(null)
  useEffect(() => {
    tokenRef.current = accessToken
  }, [accessToken])

  // ── 缓存 scope 同步（增量 8 · Q4）：登录 / 角色切换时更新 `userId:role` ──
  // 由 scope 参与 useAsync 的 effect 依赖 ⇒ 角色 / 用户变化自动重取，天然不串数据。
  useEffect(() => {
    setCacheScope(user?.id ?? null, preferences.role)
  }, [user?.id, preferences.role])

  // ── 注入 client 依赖（token 提供者 + 401 处理） ──────────────────
  useEffect(() => {
    setTokenProvider(() => tokenRef.current)
    setUnauthorizedHandler(() => {
      tokenRef.current = null
      setAccessToken(null)
      setUser(null)
      setTenant(null)
      setRoles([])
      void deleteSecureItem(TOKEN_KEYS.access)
      void deleteSecureItem(TOKEN_KEYS.refresh)
    })
    return () => {
      setUnauthorizedHandler(null)
    }
  }, [])

  // ── 冷启动恢复：读取偏好 + token，尝试静默恢复会话 ───────────────
  useEffect(() => {
    let cancelled = false
    const bootstrap = async () => {
      try {
        const [rawPreferences, storedAccess, storedRefresh] = await Promise.all([
          AsyncStorage.getItem(PREFERENCE_KEYS.rememberMe),
          getSecureItem(TOKEN_KEYS.access),
          getSecureItem(TOKEN_KEYS.refresh),
        ])
        if (cancelled) return

        let restored: AppPreferences = DEFAULT_PREFERENCES
        if (rawPreferences) {
          try {
            restored = { ...DEFAULT_PREFERENCES, ...(JSON.parse(rawPreferences) as Partial<AppPreferences>) }
          } catch {
            restored = DEFAULT_PREFERENCES
          }
        }
        setPreferences(restored)

        if (storedAccess) {
          tokenRef.current = storedAccess
          setAccessToken(storedAccess)
          try {
            const context = await authService.me()
            if (cancelled) return
            setUser(context.user)
            setTenant(context.tenant)
            setRoles(context.roles)
          } catch {
            // token 失效：清理并回到登录页
            tokenRef.current = null
            setAccessToken(null)
            await deleteSecureItem(TOKEN_KEYS.access)
            await deleteSecureItem(TOKEN_KEYS.refresh)
          }
        }
        void storedRefresh
      } finally {
        if (!cancelled) setIsBootstrapping(false)
      }
    }
    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  /** 持久化偏好 */
  const persistPreferences = useCallback(async (next: AppPreferences) => {
    setPreferences(next)
    try {
      await AsyncStorage.setItem(PREFERENCE_KEYS.rememberMe, JSON.stringify(next))
      await AsyncStorage.setItem(PREFERENCE_KEYS.role, next.role)
      if (next.lastEmail) await AsyncStorage.setItem(PREFERENCE_KEYS.lastEmail, next.lastEmail)
    } catch {
      // 忽略：偏好写入失败不影响使用
    }
  }, [])

  /** 写入会话 */
  const signIn = useCallback(
    async (result: LoginResult, options?: { rememberMe?: boolean; biometricEnabled?: boolean }) => {
      tokenRef.current = result.tokens.accessToken
      setAccessToken(result.tokens.accessToken)
      setUser(result.me.user)
      setTenant(result.me.tenant)
      setRoles(result.me.roles)

      // token 入安全存储（native = SecureStore，web = localStorage）
      await setSecureItem(TOKEN_KEYS.access, result.tokens.accessToken)
      await setSecureItem(TOKEN_KEYS.refresh, result.tokens.refreshToken)

      const next: AppPreferences = {
        ...preferences,
        rememberMe: options?.rememberMe ?? preferences.rememberMe,
        biometricEnabled: options?.biometricEnabled ?? preferences.biometricEnabled,
        lastEmail: options?.rememberMe === false ? preferences.lastEmail : result.me.user.email,
      }
      await persistPreferences(next)
    },
    [persistPreferences, preferences],
  )

  /** 退出登录 */
  const signOut = useCallback(async () => {
    try {
      await authService.logout()
    } catch {
      // 忽略：登出接口失败也要清本地
    }
    tokenRef.current = null
    setAccessToken(null)
    setUser(null)
    setTenant(null)
    setRoles([])
    setOptimistic([])
    await deleteSecureItem(TOKEN_KEYS.access)
    await deleteSecureItem(TOKEN_KEYS.refresh)
    // 退出登录：清空全部缓存（Q4），避免重登后残留旧数据
    await clearAllCache()
    const next: AppPreferences = { ...preferences, biometricEnabled: false }
    await persistPreferences(next)
  }, [persistPreferences, preferences])

  /** 切换演示角色 */
  const setRole = useCallback(
    async (role: AppRole) => {
      await persistPreferences({ ...preferences, role })
    },
    [persistPreferences, preferences],
  )

  /** 开启 / 关闭生物识别 */
  const setBiometricEnabled = useCallback(
    async (enabled: boolean) => {
      await persistPreferences({ ...preferences, biometricEnabled: enabled })
    },
    [persistPreferences, preferences],
  )

  /** 重新拉取当前用户上下文 */
  const refreshMe = useCallback(async () => {
    const context = await authService.me()
    setUser(context.user)
    setTenant(context.tenant)
    setRoles(context.roles)
  }, [])

  // ── 乐观更新登记 ────────────────────────────────────────────────
  const pushOptimistic = useCallback((entry: { taskId: string; from: TaskStatus; to: TaskStatus }) => {
    optimisticSeq += 1
    const id = `opt-${optimisticSeq}`
    setOptimistic((prev) => [...prev, { id, createdAt: Date.now(), ...entry }])
    return id
  }, [])

  const rollbackOptimistic = useCallback((id: string) => {
    setOptimistic((prev) => prev.filter((entry) => entry.id !== id))
  }, [])

  const commitOptimistic = useCallback((id: string) => {
    setOptimistic((prev) => prev.filter((entry) => entry.id !== id))
  }, [])

  const findOptimistic = useCallback(
    (taskId: string) => optimistic.find((entry) => entry.taskId === taskId) ?? null,
    [optimistic],
  )

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      tenant,
      roles,
      role: preferences.role,
      isAuthenticated: user !== null,
      isBootstrapping,
      preferences,
      optimistic,
      signIn,
      signOut,
      setRole,
      setBiometricEnabled,
      refreshMe,
      pushOptimistic,
      rollbackOptimistic,
      commitOptimistic,
      findOptimistic,
    }),
    [
      user,
      tenant,
      roles,
      preferences,
      isBootstrapping,
      optimistic,
      signIn,
      signOut,
      setRole,
      setBiometricEnabled,
      refreshMe,
      pushOptimistic,
      rollbackOptimistic,
      commitOptimistic,
      findOptimistic,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

/** 读取全局上下文（必须在 AppProvider 内使用） */
export function useAppContext(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext 必须在 <AppProvider> 内部使用')
  }
  return context
}
