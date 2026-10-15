/**
 * 职责：应用入口 —— 挂载 React 根节点：QueryClientProvider（TanStack Query）+ ConfigProvider（AntD 暗色主题）+ BrowserRouter（React Router v7）
 */

// 清理历史预览构建注入的 Service Worker。
// 早期 preview 构建启用过 PWA SW，其 CacheFirst + navigateFallback 会长期缓存旧版 JS，
// 导致已修复的页面（如资源池）一直走旧逻辑/旧接口而“加载失败”。新版本已移除 PWA，
// 这里在入口强制注销残留 SW 并清空缓存，确保浏览器加载最新代码。
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister().catch(() => {})))
    if (typeof caches !== 'undefined' && caches.keys) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k).catch(() => {})))
    }
  })
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntdApp, ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { BrowserRouter } from 'react-router-dom'
import '@ant-design/v5-patch-for-react-19'
import './styles/responsive.css'
import App from './App'

dayjs.locale('zh-cn')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
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
            fontFamily: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif`,
          },
        }}
      >
        <AntdApp>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AntdApp>
      </ConfigProvider>
    </QueryClientProvider>
  </StrictMode>,
)