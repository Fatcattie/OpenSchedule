/**
 * 职责：认证服务 —— 登录 / 当前用户 / 登出 / 生物识别会话。
 * 每个函数首行 `if (USE_MOCK)` 短路本地实现，真实模式保留 `// TODO(real-api)` 调用位（ARCH §10）。
 */
import { DEMO_USER_IDS, db, findUser } from '@/data'
import { ApiError, type AuthTokens, type LoginInput, type MeResponse, type User } from '@/types'
import { authenticateBiometric, getBiometricCapability, type BiometricCapability } from './platform/biometrics'
import { httpClient, simulateLatency, delay } from './client'
import { USE_MOCK } from './config'

/** 登录结果：token + 用户上下文 */
export interface LoginResult {
  tokens: AuthTokens
  me: MeResponse
}

/** 演示账号（仅 mock 模式生效） */
export const DEMO_CREDENTIALS = {
  email: 'zhangwei@example.com',
  password: 'openschedule',
} as const

/** 演示角色：登录后默认以「管理人员」进入，便于演示审核流 */
const DEFAULT_ROLES = ['manager', 'member']

/** 构造 mock token */
function makeMockTokens(): AuthTokens {
  const issuedAt = Date.now()
  return {
    accessToken: `mock.access.${issuedAt}`,
    refreshToken: `mock.refresh.${issuedAt}`,
  }
}

/** 构造 /auth/me 响应 */
function buildMe(): MeResponse {
  const user = findUser(DEMO_USER_IDS.me) ?? db.users[0]
  return {
    user,
    tenant: db.tenant,
    roles: [...DEFAULT_ROLES],
  }
}

/** 获取当前用户上下文（GET /auth/me） */
export async function me(): Promise<MeResponse> {
  if (USE_MOCK) {
    await simulateLatency()
    return buildMe()
  }
  // TODO(real-api): GET /auth/me
  return httpClient.get<MeResponse>('/auth/me')
}

/**
 * 账号密码登录。
 * mock 模式下校验演示账号；真实模式走 POST /auth/login。
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  if (USE_MOCK) {
    await simulateLatency()
    const email = input.email.trim().toLowerCase()
    const matched =
      email === DEMO_CREDENTIALS.email || db.users.some((user) => user.email.toLowerCase() === email)
    if (!matched || input.password !== DEMO_CREDENTIALS.password) {
      throw new ApiError(40101, '账号或密码不正确，请重新输入')
    }
    return { tokens: makeMockTokens(), me: buildMe() }
  }
  // TODO(real-api): POST /auth/login
  const tokens = await httpClient.post<AuthTokens>('/auth/login', input, { skipAuth: true })
  const context = await me()
  return { tokens, me: context }
}

/** 登出（清理服务端会话；本地凭证由 AppProvider 清理） */
export async function logout(): Promise<void> {
  if (USE_MOCK) {
    await delay(120)
    return
  }
  // TODO(real-api): POST /auth/logout
  await httpClient.post<void>('/auth/logout')
}

/** 用 refresh token 换新 access token（401 静默刷新位） */
export async function refresh(refreshToken: string): Promise<AuthTokens> {
  if (USE_MOCK) {
    await delay(100)
    return makeMockTokens()
  }
  // TODO(real-api): POST /auth/refresh
  return httpClient.post<AuthTokens>('/auth/refresh', { refreshToken }, { skipAuth: true })
}

/** 查询设备生物识别能力（Web 端恒为不可用） */
export async function checkBiometrics(): Promise<BiometricCapability> {
  return getBiometricCapability()
}

/**
 * 生物识别快捷解锁：校验通过后签发会话（等价于登录）。
 * 失败返回 null，由 UI 回落到密码登录（ARCH §11 R4）。
 */
export async function loginWithBiometrics(): Promise<LoginResult | null> {
  const capability = await getBiometricCapability()
  if (!capability.available) return null

  if (USE_MOCK) {
    const passed = await authenticateBiometric('验证身份以解锁 OpenSchedule')
    if (!passed) return null
    return { tokens: makeMockTokens(), me: buildMe() }
  }
  // TODO(real-api): POST /auth/biometric/verify（携带设备凭证换取 access token）
  const passed = await authenticateBiometric('验证身份以解锁 OpenSchedule')
  if (!passed) return null
  const tokens = await httpClient.post<AuthTokens>('/auth/biometric/verify', {}, { skipAuth: true })
  const context = await me()
  return { tokens, me: context }
}

/** 更新当前用户资料（我的页展示用，mock 仅本地生效） */
export async function updateProfile(patch: Partial<Pick<User, 'displayName' | 'bio' | 'motto' | 'phone'>>): Promise<User> {
  if (USE_MOCK) {
    await delay(160)
    const user = findUser(DEMO_USER_IDS.me) ?? db.users[0]
    Object.assign(user, patch, { updatedAt: new Date().toISOString() })
    return { ...user }
  }
  // TODO(real-api): PATCH /users/me
  return httpClient.patch<User>('/users/me', patch)
}
