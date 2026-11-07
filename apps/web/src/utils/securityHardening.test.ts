/**
 * 安全加固回归测试（docs/code-analysis-report.md：M-4 CSV 公式注入 / M-5 token 不落 localStorage）
 */
import { describe, expect, it } from 'vitest'
import { TOKEN_STORAGE_KEYS } from '@/api/config'
import { useAuthStore } from '@/stores/authStore'
import { neutralizeCsvFormula } from './download'

describe('M-4 neutralizeCsvFormula', () => {
  it('公式触发字符开头加单引号，纯数值与普通文本不变', () => {
    expect(neutralizeCsvFormula('=HYPERLINK("http://evil")')).toBe(`'=HYPERLINK("http://evil")`)
    expect(neutralizeCsvFormula('@SUM(A1)')).toBe(`'@SUM(A1)`)
    expect(neutralizeCsvFormula('+cmd|calc')).toBe(`'+cmd|calc`)
    expect(neutralizeCsvFormula('-3.5')).toBe('-3.5')
    expect(neutralizeCsvFormula('任务 A')).toBe('任务 A')
  })
})

describe('M-5 authStore（真实模式）', () => {
  it('access token 只存内存，不写入 localStorage；clear 清空', () => {
    useAuthStore.getState().setAccessToken('real.jwt.token')
    expect(useAuthStore.getState().accessToken).toBe('real.jwt.token')
    expect(localStorage.getItem(TOKEN_STORAGE_KEYS.access)).toBeNull()
    expect(localStorage.getItem(TOKEN_STORAGE_KEYS.refresh)).toBeNull()
    expect('refreshToken' in useAuthStore.getState()).toBe(false)
    useAuthStore.getState().clear()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })
})
