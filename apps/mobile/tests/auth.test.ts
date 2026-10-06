/**
 * 职责：auth.service mock 分支测试（B）—— 登录成功 / 失败、/auth/me、生物识别回落。
 * 显式 mock expo-local-authentication，避免测试依赖原生模块。
 */
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => false),
  isEnrolledAsync: jest.fn(async () => false),
  supportedAuthenticationTypesAsync: jest.fn(async () => []),
  authenticateAsync: jest.fn(async () => ({ success: true })),
  AuthenticationType: { FACIAL_RECOGNITION: 2, FINGERPRINT: 1 },
}))

import { DEMO_USER_IDS, resetDatabase } from '@/data'
import { ApiError } from '@/types'
import * as authService from '@/services/auth.service'

beforeEach(() => {
  resetDatabase()
})

describe('login —— 账号密码登录', () => {
  it('演示账号登录成功返回 token 与用户上下文', async () => {
    const result = await authService.login({ email: 'zhangwei@example.com', password: 'openschedule' })
    expect(result.tokens.accessToken).toMatch(/^mock\.access\./)
    expect(result.tokens.refreshToken).toMatch(/^mock\.refresh\./)
    expect(result.me.user.id).toBe(DEMO_USER_IDS.me)
    expect(result.me.tenant?.name).toBe('北极星研发组')
    expect(result.me.roles).toContain('manager')
  })

  it('大小写/空白不敏感匹配邮箱', async () => {
    const result = await authService.login({ email: '  ZhangWei@Example.com ', password: 'openschedule' })
    expect(result.me.user.id).toBe(DEMO_USER_IDS.me)
  })

  it('密码错误抛 40101', async () => {
    const error = (await authService
      .login({ email: 'zhangwei@example.com', password: 'wrong' })
      .catch((e) => e as ApiError)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe(40101)
  })

  it('未知账号抛 40101', async () => {
    await expect(authService.login({ email: 'nobody@example.com', password: 'openschedule' })).rejects.toMatchObject(
      { code: 40101 },
    )
  })
})

describe('me / logout', () => {
  it('me 返回当前用户与租户', async () => {
    const context = await authService.me()
    expect(context.user.id).toBe(DEMO_USER_IDS.me)
    expect(context.tenant).not.toBeNull()
  })

  it('logout 正常完成不抛错', async () => {
    await expect(authService.logout()).resolves.toBeUndefined()
  })
})

describe('生物识别 —— Web/无硬件回落', () => {
  it('无硬件时能力不可用，快捷解锁返回 null（回落密码）', async () => {
    const capability = await authService.checkBiometrics()
    expect(capability.available).toBe(false)
    const result = await authService.loginWithBiometrics()
    expect(result).toBeNull()
  })
})
