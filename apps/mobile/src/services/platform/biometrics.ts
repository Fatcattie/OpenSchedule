/**
 * 职责：生物识别适配层（native 实现）—— 使用 expo-local-authentication。
 * Web 端由同目录 `biometrics.web.ts` 覆盖，避免 Web 打包引入原生模块（ARCH §11 R1 / R4）。
 */
import * as LocalAuthentication from 'expo-local-authentication'

/** 生物识别能力描述 */
export interface BiometricCapability {
  /** 是否可用（硬件 + 已录入） */
  available: boolean
  /** 展示用名称：Face ID / 指纹解锁 */
  label: string
}

/** 查询设备生物识别能力 */
export async function getBiometricCapability(): Promise<BiometricCapability> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync()
    if (!hasHardware) return { available: false, label: '生物识别' }
    const enrolled = await LocalAuthentication.isEnrolledAsync()
    if (!enrolled) return { available: false, label: '生物识别' }
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync()
    const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
    const hasFingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
    const label = hasFace ? '面容解锁' : hasFingerprint ? '指纹解锁' : '生物识别'
    return { available: true, label }
  } catch {
    return { available: false, label: '生物识别' }
  }
}

/** 发起生物识别校验，返回是否通过 */
export async function authenticateBiometric(promptMessage: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: '改用密码',
      disableDeviceFallback: true,
    })
    return result.success
  } catch {
    return false
  }
}
