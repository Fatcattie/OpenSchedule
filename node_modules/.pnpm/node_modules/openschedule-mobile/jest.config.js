/**
 * 职责：QA 单元测试配置（jest-expo preset + `@/` 别名映射）。
 * 由 QA 独立添加，不改动业务源码；测试代码位于 tests/ 目录。
 * 运行：npx jest --config jest.config.js
 */
module.exports = {
  preset: 'jest-expo',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // ─────────────────────────────────────────────────────────────────────────────
  // 负载型假红（flaky）修复 —— 根因：超时 → 放弃用例 → React 全局 act 队列被污染
  // ─────────────────────────────────────────────────────────────────────────────
  // 机制（已用最小实验复现，非推断）：
  // 1) jest 的 testTimeout 覆盖「用例执行期间的模块 transform / require 耗时」。
  //    `--no-cache` 下每个测试文件都要从零 transform jest-expo + RN 的整个 import
  //    图，这笔一次性成本几乎全部落在**套件内首个用例**上。实测
  //    tests/audit-center-render.test.tsx：空载首用例 ~7.5s、其余用例仅 0.4~2.6s；
  //    带 transform 缓存时首用例降到 ~2.1s ⇒ 证实该成本来自 transform。
  // 2) 一旦某用例超过 testTimeout，jest 会**放弃该用例、直接跑下一个**，而被放弃的
  //    异步用例仍在后台推进；它与后续用例并发进入 React 的**全局 act 队列**
  //    （ReactSharedInternals.actQueue），令其在 commit 前被复位 ⇒ 后续每个用例里
  //    `TestRenderer.create(...)` 的渲染永远不被 commit，`renderer.root` 因
  //    `getChildren(root.current).length === 0` 抛
  //    "Can't access .root on unmounted test renderer"，形成**级联假红**。
  //    实测：单跑本套件并强制 `--testTimeout=5000`（仅让首个 ~7.5s 用例超时）⇒
  //    复现与缺陷记录**完全一致**的 14 failed / 2 passed，报错全为该串、且**无任何
  //    断言失败**（Expected/Received 计数为 0）。
  // 3) 故根因是「超时 → 放弃 → act 队列污染」的级联，**不是**业务回归，也**不是**
  //    定时器 / 异步句柄泄漏（`--detectOpenHandles` 全绿、无残留句柄）。
  // 4) 满载（7 worker 全量 `--no-cache`）下首用例实测被拖到 ~20s（空载的 ~2.7 倍）。
  //    上调至 120000 为该一次性 transform 成本在满载下预留约 6 倍余量，从根上消除
  //    「放弃用例」这一触发条件（不删用例、不跳过、不削弱任何断言）。
  testTimeout: 120000,

  // 负载型假红（flaky）修复 —— 收敛并发，降低 transform 互相饿死
  // `--no-cache` 全量运行会让多个 worker 同时从零 transform 同一份重型
  // jest-expo + RN import 图，CPU 争抢使首用例耗时被放大（实测 2.7 倍）。将并发收敛
  // 到 4（本机 8 核），使首用例耗时更稳定、可控，为上面的 testTimeout 留出更可靠的
  // 余量。纯测试侧并行度调整，不改变任何用例与断言。
  maxWorkers: 4,
}
