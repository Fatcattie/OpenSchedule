/**
 * 职责：Vite 构建/开发配置 —— dev 代理 /api → 主后端 localhost:3000、路径别名 @ → src
 *
 * 说明：已移除 vite-plugin-pwa（PWA Service Worker）。
 * 演示/MVP 预览阶段 Service Worker 的 CacheFirst + navigateFallback 会缓存旧版 JS，
 * 导致已修复的页面（如资源池）一直加载旧逻辑/旧接口而"加载失败"。
 * 离线能力属于后续增强批次，移除后由 main.tsx 在入口强制注销历史残留 SW。
 *
 * §3.7 R8：vitest 集成 —— 在 vite.config.ts 中复用 alias/build 配置；jsdom 环境，
 * `*.test.{ts,tsx}` 与 `*.spec.{ts,tsx}` 走 vitest，其它文件走 vite 运行时。
 */
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),
  ],
  // §3.9 R7-6：dist 收敛 + 代码分割
  // - 固定 `dist` 目录（消除 dist-mvp-* 历史目录）；emptyOutDir 默认 true（vite 7 自动清理）
  // - manualChunks：antd / icons / vis-network / socket.io / dayjs 各自独立 chunk，配合路由级 lazy 实现按需加载
  // - chunkSizeWarningLimit 提到 1500 KB：antd+react+vendor 合并 vendor 后仍接近 1MB；后续可继续拆 vendor
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // 用 id 匹配函数把相关 npm 模块按需分组到 vendor chunk。
        // 匹配规则：node_modules 路径 + 子路径前缀命中即归入对应 chunk。
        // vis-data/vis-util 仅作 vis-network peer，未在本应用直接 import；通过此函数一起合并避免 Rollup 单独入口解析。
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          // vis-network 系（含 peer：vis-data、vis-util）
          if (
            id.includes('/vis-network/') ||
            id.includes('/vis-data/') ||
            id.includes('/vis-util/')
          ) {
            return 'vendor-vis'
          }
          // WebSocket 客户端
          if (id.includes('/socket.io-client/') || id.includes('/engine.io-client/')) {
            return 'vendor-socket'
          }
          // antd 体系（含 icons、v5 patch、rc-*）
          if (
            id.includes('/antd/') ||
            id.includes('/@ant-design/') ||
            /\/node_modules\/rc-[^/]+\//.test(id)
          ) {
            return 'vendor-antd'
          }
          // React 运行时
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router') ||
            id.includes('/scheduler/')
          ) {
            return 'vendor-react'
          }
          // 状态/数据
          if (
            id.includes('/zustand/') ||
            id.includes('/@tanstack/') ||
            id.includes('/axios/')
          ) {
            return 'vendor-state'
          }
          // dayjs
          if (id.includes('/dayjs/')) {
            return 'vendor-dayjs'
          }
          return undefined
        },
      },
    },
  },
  resolve: {
    alias: {
      // 路径别名：import { xxx } from '@/api/xxx' 等价于 src/api/xxx
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 工作台业务规则共享包（D-07 二期）：直接用 TS 源码，mock 演示模式在浏览器内执行与服务端同一份规则
      '@openschedule/workspace-rules': fileURLToPath(new URL('../../packages/workspace-rules/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // 开发代理：前端请求 /api/v1/... 转发到主后端（NestJS 默认 3000，见规格 3.7 APP_PORT）
    // /socket.io：WS 实时刷新（R6-4）——socket.io-client 走同端口 dev server，ws:true 升级请求
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  // §3.7 R8：vitest 单元/组件测试配置
  // - environment: jsdom 模拟浏览器；AntD/React 组件渲染需要 DOM
  // - setupFiles: 引入 @testing-library/jest-dom 扩展 expect 匹配器（toBeInTheDocument 等）
  // - globals: 显式 false —— 测试文件统一 `import { describe, it, expect, vi } from 'vitest'`，避免与 jest 字符串测试同名 describe 撞名
  // - include: src/**/*.{test,spec}.{ts,tsx}（与既有 PersonnelPage.test.tsx 文件命名一致）
  // - exclude: node_modules + dist + mocks（__fixtures__/mock 是 fixture 非单元测试目标）
  // - renderWithAntd / TestProviders 等带 JSX 的辅助组件用单独 .tsx 文件存放，避免 setup.ts 被 esbuild 解析
  test: {
    environment: 'jsdom',
    globals: false,
    // 测试时区固定 UTC：日期/时刻断言不受开发机与 CI 时区影响（recurrence 等纯函数测试依赖）
    env: { TZ: 'UTC' },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '**/__fixtures__/**'],
    coverage: {
      provider: 'v8',
      // text/html 本地可读；lcov 供 CI 上传产物
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/main.tsx',
        'src/__fixtures__/**',
        'src/**/*.d.ts',
      ],
      // R8-2 覆盖率基线门禁（2026-10-10 采集）：
      // - 全局下限 = 当前基线向下取整，覆盖率只许升不许降
      // - 已测单元按文件锁定高水位（glob key 为 vitest per-file thresholds）
      // - 提升方式 = 为新代码/新页面补测试后在此上调阈值，禁止下调
      // - 2026-10-17 D-07 一期补测后上调（实测 4.9 / 4.96 / 3.71 / 4.96）
      // - 2026-10-18 D-07 二期后上调（实测 5.39 / 5.2 / 4.36 / 5.38）
      thresholds: {
        statements: 5,
        branches: 5,
        functions: 4,
        lines: 5,
        'src/utils/workspaceSync.ts': {
          statements: 95,
          branches: 90,
          functions: 100,
          lines: 95,
        },
        'src/hooks/useCurrentRole.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        'src/utils/recurrence.ts': {
          statements: 95,
          branches: 80,
          functions: 100,
          lines: 95,
        },
        'src/features/personnel/PersonnelPage.tsx': {
          statements: 50,
          branches: 60,
          functions: 30,
          lines: 50,
        },
      },
    },
  },
})