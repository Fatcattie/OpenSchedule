/**
 * 动态应用配置：在 app.json 静态配置之上注入构建期环境变量。
 *
 * - `EAS_PROJECT_ID`：EAS 项目 ID，可覆盖默认值（如 fork 到自己的 Expo 账号时）。
 *   默认值为 `@bigcatleos-team/openschedule`（与 app.json 的 owner/slug 对应）；
 *   项目 ID 不是机密，eas-cli 也不读 `.env.local`，故直接内置，免得每条 eas 命令都要先设变量。
 */
import type { ConfigContext, ExpoConfig } from 'expo/config'

const DEFAULT_EAS_PROJECT_ID = 'c728f5e8-e8a1-48dc-9565-cee8126d958a'

/**
 * 生产构建断言（安全问题 L-1）：mock 模式含明文演示口令与本地假数据，绝不能打进生产安装包。
 * `EAS_BUILD_PROFILE` 由 EAS 构建环境注入；production 档位下必须关闭 mock 且配置真实 API 源站，否则构建失败。
 */
function assertProductionBuildConfig(): void {
  if (process.env.EAS_BUILD_PROFILE !== 'production') return
  const problems: string[] = []
  if (process.env.EXPO_PUBLIC_USE_MOCK?.trim() !== 'false') problems.push('EXPO_PUBLIC_USE_MOCK 必须为 false')
  if (!process.env.EXPO_PUBLIC_API_URL?.trim()) problems.push('EXPO_PUBLIC_API_URL 未配置（为空时客户端会回落 mock 模式）')
  if (problems.length > 0) {
    throw new Error(`生产构建配置不安全，已中止：${problems.join('；')}`)
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  assertProductionBuildConfig()
  const projectId = process.env.EAS_PROJECT_ID?.trim() || DEFAULT_EAS_PROJECT_ID
  return {
    ...config,
    extra: {
      ...config.extra,
      eas: { projectId },
    },
  } as ExpoConfig
}
