/**
 * 职责：安全存储适配层（native 实现）—— 使用 expo-secure-store 读写 token。
 * Web 端由同目录 `secureStore.web.ts` 覆盖（Metro 按平台后缀解析），
 * 从而保证 `expo export --platform web` 不会把原生模块打进 Web 包（ARCH §11 R1）。
 */
import * as SecureStore from 'expo-secure-store'

/** native 平台具备安全存储能力 */
export const isSecureStorageAvailable = true

/** 读取安全存储项 */
export async function getSecureItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key)
  } catch {
    return null
  }
}

/** 写入安全存储项（失败不抛出，避免阻断登录主流程） */
export async function setSecureItem(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value)
  } catch {
    // 忽略：Keychain / Keystore 不可用时静默降级
  }
}

/** 删除安全存储项 */
export async function deleteSecureItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key)
  } catch {
    // 忽略
  }
}
