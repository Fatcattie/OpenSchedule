/**
 * 职责：会话读写 hook —— 在 AppProvider 之上封装登录 / 生物识别 / 登出与提交态、错误文案。
 */
import { useCallback, useEffect, useState } from 'react'
import { useAppContext, type AppContextValue } from '@/store/AppProvider'
import { useT } from '@/store/I18nProvider'
import { authService } from '@/services'
import type { BiometricCapability } from '@/services/platform/biometrics'
import { getErrorMessage, type LoginInput } from '@/types'

/** useAuth 返回值 */
export interface UseAuthResult extends AppContextValue {
  /** 登录请求进行中 */
  submitting: boolean
  /** 登录错误文案（人话） */
  error: string | null
  /** 生物识别能力 */
  biometrics: BiometricCapability
  /** 账号密码登录，成功返回 true */
  signInWithPassword: (input: LoginInput, rememberMe: boolean) => Promise<boolean>
  /** 生物识别快捷解锁，成功返回 true */
  signInWithBiometrics: () => Promise<boolean>
  /** 退出登录 */
  signOutAsync: () => Promise<void>
  /** 清空错误文案 */
  clearError: () => void
}

/** 会话 hook */
export function useAuth(): UseAuthResult {
  const context = useAppContext()
  const t = useT()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [biometrics, setBiometrics] = useState<BiometricCapability>({
    available: false,
    label: t('biometric.generic'),
  })

  // 查询设备生物识别能力（Web 端恒不可用）
  useEffect(() => {
    let cancelled = false
    void authService.checkBiometrics().then((capability) => {
      if (!cancelled) setBiometrics(capability)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const signInWithPassword = useCallback(
    async (input: LoginInput, rememberMe: boolean): Promise<boolean> => {
      setSubmitting(true)
      setError(null)
      try {
        const result = await authService.login(input)
        await context.signIn(result, { rememberMe })
        return true
      } catch (err) {
        setError(getErrorMessage(err))
        return false
      } finally {
        setSubmitting(false)
      }
    },
    [context],
  )

  const signInWithBiometrics = useCallback(async (): Promise<boolean> => {
    setSubmitting(true)
    setError(null)
    try {
      const result = await authService.loginWithBiometrics()
      if (!result) {
        setError(t('auth.biometricFailed'))
        return false
      }
      await context.signIn(result)
      return true
    } catch (err) {
      setError(getErrorMessage(err))
      return false
    } finally {
      setSubmitting(false)
    }
  }, [context, t])

  const signOutAsync = useCallback(async () => {
    await context.signOut()
  }, [context])

  const clearError = useCallback(() => setError(null), [])

  return {
    ...context,
    submitting,
    error,
    biometrics,
    signInWithPassword,
    signInWithBiometrics,
    signOutAsync,
    clearError,
  }
}
