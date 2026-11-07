/**
 * 动态应用配置：在 app.json 静态配置之上注入构建期环境变量。
 *
 * - `EAS_PROJECT_ID`：EAS 项目 ID，可覆盖默认值（如 fork 到自己的 Expo 账号时）。
 *   默认值为 `@bigcatleos-team/openschedule`（与 app.json 的 owner/slug 对应）；
 *   项目 ID 不是机密，eas-cli 也不读 `.env.local`，故直接内置，免得每条 eas 命令都要先设变量。
 */
import type { ConfigContext, ExpoConfig } from 'expo/config'

const DEFAULT_EAS_PROJECT_ID = 'c728f5e8-e8a1-48dc-9565-cee8126d958a'

export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId = process.env.EAS_PROJECT_ID?.trim() || DEFAULT_EAS_PROJECT_ID
  return {
    ...config,
    extra: {
      ...config.extra,
      eas: { projectId },
    },
  } as ExpoConfig
}
