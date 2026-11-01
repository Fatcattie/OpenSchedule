/**
 * 测试渲染工具（§3.7 R8-1）—— antd App + ConfigProvider 主题上下文，与生产对齐
 *
 * - 必包 `<App>`：组件内部 `App.useApp()` / `App.useMessage()` 拿到的 hook 来自此 Provider；不包会导致 hook 顺序错乱
 * - `<ConfigProvider>`：locale + 暗色主题 token，与 main.tsx 保持一致
 * - 单独放在 .tsx 文件以避免 setup.ts 在 esbuild 解析时遇到 JSX
 */
import type { ReactElement } from 'react'
import { App as AntdApp, ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { render, type RenderOptions } from '@testing-library/react'

export function renderWithAntd(ui: ReactElement, options?: RenderOptions) {
  return render(
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorBgBase: '#0e121c',
          colorPrimary: '#00e5a0',
          colorSuccess: '#00e5a0',
          colorError: '#ff7356',
          colorWarning: '#f5a623',
          colorInfo: '#4da3ff',
          borderRadius: 6,
        },
      }}
    >
      <AntdApp component={false}>{ui}</AntdApp>
    </ConfigProvider>,
    options,
  )
}
