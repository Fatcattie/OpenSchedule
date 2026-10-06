/**
 * 职责：安全存储适配层（Web 实现）—— Web 端无 Keychain / Keystore，
 * 降级使用 localStorage 保存 token（仅演示用；生产 Web 应由 HttpOnly Cookie 承载）。
 * 本文件不 import 任何原生模块，保证 Web 打包安全（ARCH §11 R1）。
 */

/** Web 平台不具备系统级安全存储 */
export const isSecureStorageAvailable = false

/** 取 localStorage（SSR / 无 window 环境返回 null） */
function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

/** 读取存储项 */
export async function getSecureItem(key: string): Promise<string | null> {
  const storage = getStorage()
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

/** 写入存储项 */
export async function setSecureItem(key: string, value: string): Promise<void> {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(key, value)
  } catch {
    // 忽略：隐私模式写入失败
  }
}

/** 删除存储项 */
export async function deleteSecureItem(key: string): Promise<void> {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    // 忽略
  }
}
