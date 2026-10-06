# 交付概览：jest 负载型假红（flaky）根治

> 团队 `software-mobile-flaky` · 项目 `apps/mobile` · 日期：2026-10-05
> 触发来源：增量 8（M-P1-06）QA 轮 RUN1 实测 **14 例假红**

## TL;DR

`tests/audit-center-render.test.tsx` 在 `npx jest --no-cache` 满载下的偶发假红**已根治**。根因**不是**「超时」本身，而是**超时后的级联污染**：jest 放弃超时用例后，被放弃的异步用例仍在后台推进，污染 React 的**全局 act 队列**，导致后续所有用例的渲染永不 commit。修复仅动 **1 个文件**（`jest.config.js`），**未改任何用例、任何断言、任何业务源码**。

## 根因链（已用最小实验复现，非推断）

```
--no-cache 冷 transform 成本几乎全落在「套件内首个用例」
        ↓ 超过 testTimeout（实测空载 ~7.5s、满载 ~20s）
jest 放弃该用例、直接跑下一个（但被放弃的异步用例仍在后台推进）
        ↓
它与后续用例并发进入 React 全局 act 队列（ReactSharedInternals.actQueue），在 commit 前被复位
        ↓
后续每个用例 TestRenderer.create(...) 的渲染永不 commit
        ↓
renderer.root 因 getChildren(root.current).length === 0 抛
"Can't access .root on unmounted test renderer" → 级联假红（1 例超时 ⇒ 14 例红）
```

### 四条证据（逐条区分「transform 超时」vs「异步泄漏」）

| 证据 | 内容 | 结论 |
|---|---|---|
| **A** 成本来自 transform | 单跑该套件：**空载首用例 7486ms**、其余仅 400–2600ms；**带 transform 缓存时首用例降到 2062ms** | 首用例成本是 babel transform，非运行期等待 |
| **B** 复现缺陷（决定性） | 强制 `--testTimeout=5000`（只让 ~7.5s 的首用例超时）→ 复现**完全一致**的 **14 failed / 2 passed**，报错全为该串 | 一个用例超时即可级联出 14 红 |
| **C** 排除泄漏 | `--detectOpenHandles` 单跑该套件 → 16/16 绿、**无任何残留句柄** | 不存在未清理的真实定时器/异步泄漏 |
| **D** 满载放大 | 全量 `--no-cache`（7 worker）下首用例被拖到 **20157ms**（空载的 ~2.7 倍） | 并发争抢是放大来源 |

## 修复（仅 1 个文件）

`apps/mobile/jest.config.js`：

| 项 | 改动 | 理由 |
|---|---|---|
| `testTimeout` | `60000 → 120000` | 为满载下一次性 transform 成本预留 ~6 倍余量，**从根上消除「放弃用例」这一触发条件** |
| `maxWorkers` | 新增 `4`（本机 8 核） | 降低多 worker 同时冷 transform 同一重型 jest-expo+RN import 图的 CPU 争抢（实测首用例被放大 2.7 倍的直接来源） |

配置注释已完整记录上述机制与实测数据。

**未改动**：`tests/setup.ts`（无泄漏需清理）、任何测试用例（无 `it.skip`/删用例/缩断言）、任何 `src/` 业务源码。

## 验证

### 主理人独立复现（决定性）
`npx jest --config jest.config.js --no-cache --testTimeout=5000 tests/audit-center-render.test.tsx` → **14 failed / 2 passed / exit 1**，与原始缺陷记录一致。

### QA 独立验证（严过关）—— ✅ IS_PASS: YES · 路由 NoOne

| 项 | 结果 |
|---|---|
| **V1** 复现 | `--testTimeout=5000` 单套件 → **14 failed / 2 passed / exit 1**；默认配置单套件 → **16/16 / exit 0** |
| **V2** 修复有效性 | 全量 `--no-cache` ×3 → **均 48 套件 / 869 用例全绿、exit 0**、`timeout×0`、`unmounted×0`；耗时 134.4s / 124.3s / 132.2s |
| **V3** 防作弊 | 48/869（≥基线）；全仓 `tests/` **无** `it.skip`/`test.skip`/`xit(`/`describe.skip`/`.only`；`audit-center-render.test.tsx` mtime 仍 `2026-10-02 09:20`、用例仍 16；`jest.config.js` **无** `testPathIgnorePatterns`/`bail`，`testMatch` 未收窄 |
| **V4** 抗压（重点） | 绕开配置 `--maxWorkers=8` 全量 ×2 → 全绿。**余量探针**：`testTimeout=30000` 仍全绿（余量 ≥4×）；`testTimeout=10000` → 7 套件红 / 53 用例红、首个崩的正是 `audit-center-render` ⇒ 触发阈值落在 `10s < 阈值 ≤ 30s`，与「满载首用例 ~20s」吻合 ⇒ **120000 相对真实阈值约 6× 余量，稳健** |
| **V5** 未回归 | `tsc --noEmit` exit 0；改动仅 `jest.config.js` |

**副观测**：4 worker 墙钟 124–146s vs 8 worker 141–156s ⇒ `maxWorkers` 收敛**无性能倒退，反而略快**。

### QA 对主理人表述的一处纠正（诚实纠错）

我此前称「14 红时**零**断言失败」。QA 实测**有 1 例断言形式失败**（T-3，`Received=""`）—— 但空串是**渲染未 commit 的级联症状**，非业务回归。**实质结论成立，字面偏 1 例**，已如实记录。

## 残余风险（非阻断）

1. **`--no-cache` 冷 transform 成本随 import 图增长** —— 当前约 6× 余量；若未来 import 图显著膨胀逼近 120s，仍可能复现。**建议**：CI 在允许时**保留 transform 缓存**（实测首用例 7.5s → 2.1s）。
2. **`maxWorkers: 4` 对 16+ 核 CI 偏保守** —— 本机 8 核下无副作用；换机器可按核数调整。
3. **V1a 断言计数表述偏差 1 例** —— 仅文档层面。

## 文件清单

| 文件 | 改动 |
|---|---|
| `apps/mobile/jest.config.js` | `testTimeout: 60000 → 120000`；新增 `maxWorkers: 4`；补完整机制注释 |

**文档**：`docs/mobile-app/QA-mobile-flaky-fix.md`（QA 验证报告）
