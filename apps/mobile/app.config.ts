/**
 * 动态应用配置：在 app.json 静态配置之上注入构建期环境变量。
 *
 * - `EAS_PROJECT_ID`：EAS 项目 ID（`eas init` / expo.dev 项目页可得）。未设置时不写 `extra.eas`，
 *   避免占位 UUID 让 `eas build` 指向不存在的项目；设置方式见 `.env.example`。
 */
import type { ConfigContext, ExpoConfig } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId = process.env.EAS_PROJECT_ID?.trim()
  return {
    ...config,
    extra: {
      ...config.extra,
      ...(projectId ? { eas: { projectId } } : {}),
    },
  } as ExpoConfig
}
