import { defineConfig } from 'vitest/config'

/**
 * services/api 真实数据库集成测试配置（test/*.e2e-spec.ts：租户隔离 / 迁移基线 / 工作台存储）。
 * 需可达 PostgreSQL（DATABASE_URL；CI migration job 服务容器，本地可用 `npx prisma dev`）。
 * 串行执行：用例共享同一数据库，且迁移用例会调 prisma CLI。
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.e2e-spec.ts'],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
})
