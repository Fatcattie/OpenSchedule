/**
 * 职责：安全存储适配层（Web 实现）—— Web 端无 Keychain / Keystore。
 *
 * 安全问题 M-5：token 不再落 localStorage（XSS 一旦得手即可长期窃取 refresh token），改为**仅内存**保存：
 * 关闭/刷新页面即需重新登录。Expo Web 产物仅用于开发预览（生产 Web 端为 apps/web，refresh token 走 HttpOnly Cookie）。
 * 本文件不 import 任何原生模块，保证 Web 打包安全（ARCH §11 R1）。
 */

/** Web 平台不具备系统级安全存储 */
export const isSecureStorageAvailable = false

const memory = new Map<string, string>()

/** 旧版本写入 localStorage 的 token key（与 services/config.ts TOKEN_KEYS 一致），加载时清理 */
const LEGACY_LOCALSTORAGE_KEYS = ['os.access_token', 'os.refresh_token'] as const

try {
  if (typeof window !== 'undefined' && window.localStorage) {
    for (const key of LEGACY_LOCALSTORAGE_KEYS) window.localStorage.removeItem(key)
  }
} catch {
  // 隐私模式等场景 localStorage 不可用，忽略
}

/** 读取存储项 */
export async function getSecureItem(key: string): Promise<string | null> {
  return memory.get(key) ?? null
}

/** 写入存储项（仅内存） */
export async function setSecureItem(key: string, value: string): Promise<void> {
  memory.set(key, value)
}

/** 删除存储项 */
export async function deleteSecureItem(key: string): Promise<void> {
  memory.delete(key)
}
