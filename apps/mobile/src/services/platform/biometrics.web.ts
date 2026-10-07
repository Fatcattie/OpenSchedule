/**
 * 职责：生物识别适配层（Web 实现）—— Web 端统一不可用，直接降级为密码登录（ARCH §11 R4）。
 * 本文件不 import expo-local-authentication，保证 Web 打包安全。
 */
import { translate } from '@/i18n'
import { getCurrentLocale } from '@/i18n/current'

/** 生物识别能力描述 */
export interface BiometricCapability {
  available: boolean
  label: string
}

/** Web 端始终不可用 */
export async function getBiometricCapability(): Promise<BiometricCapability> {
  return { available: false, label: translate(getCurrentLocale(), 'biometric.generic') }
}

/** Web 端不支持生物识别，直接返回 false（UI 侧回落密码登录） */
export async function authenticateBiometric(_promptMessage: string): Promise<boolean> {
  return false
}
