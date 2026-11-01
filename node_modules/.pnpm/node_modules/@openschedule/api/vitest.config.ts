import { defineConfig } from 'vitest/config'

/**
 * services/api 测试配置（R8-4：jest → vitest 迁移，与 apps/web 统一测试框架）
 *
 * 约定与 apps/web 保持一致：
 * - `globals: false` —— 测试文件显式 `import { describe, it, expect, vi } from 'vitest'`，
 *   不依赖全局注入（避免与 node 全局/未来 polyfill 撞名，类型也不污染 tsconfig）。
 * - `environment: 'node'` —— API 侧无 DOM 依赖。
 *
 * 说明：spec 绝大多数为纯单测（直接 `new Class()` / 调导出函数）。
 * esbuild 不发射 `emitDecoratorMetadata`，Nest 容器级 spec（`Test.createTestingModule`）
 * 须在 spec 内手动 `Reflect.defineMetadata('design:paramtypes', …)` 补注入元数据，
 * 现例见 `attachments-charset.spec.ts`。此类 spec 增多时再改用 `unplugin-swc`。
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // test/*.spec.ts 为无 DB 的契约测试（domain-events）；test/*.e2e-spec.ts 走 vitest.e2e.config.ts
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
      // 基线门禁：只升不降，补测后同步上调（2026-10-18 R9 可观测性 + Sentry 上报后实测 29.09 / 30.18 / 28.08 / 29.15）
      thresholds: { statements: 28, branches: 29, functions: 27, lines: 28 },
    },
  },
})
