# 概览 · OpenSchedule 移动端 increment-2

## 一句话

接通 `completeTask` → 待审核 断链：成员完成任务后进入「待我审核」队列，由审核人通过/驳回，形成与「新事项提报」对称的第二条审核闭环。

## 做了什么

| 项 | 内容 |
| --- | --- |
| 范围 | 用户裁定「仅 `completeTask` 断链」档位 |
| 需求池 | 6 条：P0 × 4 全部交付、P1 × 1 交付、P2 × 1 登记不交付 |
| 源码改动 | 修改 4 个文件（`utils/submission.ts`、`services/task.service.ts`、`components/TaskCard.tsx`、`screens/TodayFocusScreen.tsx`） |
| 测试 | 新增 3 个文件（62 用例）、修改 1 个文件（仅标题） |
| 验证 | `tsc` exit 0；**28 套件 / 445 用例全绿**；AC 13/13、INV 4/4、回归 15/15 |
| 缺陷 | P0/P1/P2 = **0**；P3 × 3（2 条已登记限制 + 1 条文档口径偏差） |
| QA 判定 | `NoOne`（第 1 轮即通过） |

## 关键决策

1. **追加 T02b**（主理人裁定）：架构师发现「重开」（`reopenTask` / `moveTask`）是完成提报的**第二条退出路径**且不清审核态，会让**未完成**的任务滞留审核队列、被审核人误标为 `done`。架构师 v1.0 曾裁定「本次不改」，主理人**推翻并纳入本次**——它与 R1 是同一缺陷类，且是本次变更直接引入的新泄漏。
2. **撤销入参三态契约**：`undefined` 不动 / `null` 清理审核态 / `'pending'` 仅置回**且不复位** `reviewRequired`+`reviewerIds`。二者方向相反，是最易写错处。
3. **判定口径统一**：只能用 `resolveApproveBranch(task)` 判定「完成提报」，禁止用 `source`（`completeTask` 不改 `source`）或 `status`（种子 `task-014/015` 为 `in_progress`）。
4. **守卫求值时机**：工程师发现 ARCH 的代码草图若按字面实现（在 `task.status` 覆写后求值）会导致条件恒假、清理永不触发；修正为**赋值前求值、赋值后落地**，架构师据此出 v1.2 修订文档。

## 交付文档

- `docs/mobile-app/PRD-mobile-increment-2.md`（279 行，产品经理许清楚）
- `docs/mobile-app/ARCH-mobile-increment-2.md`（621 行 / v1.2，架构师高见远）
- `docs/mobile-app/QA-mobile-increment-2.md`（577 行，QA 严过关）
- `docs/mobile-app/DELIVERY-mobile-increment-2.md`（交付总结）

## 预览

- 增量 2：`http://127.0.0.1:4174`（产物 `apps/mobile/dist-v5`）
- 增量 1：`http://127.0.0.1:4173`（产物 `apps/mobile/dist-v4`）

## 已知限制（详见交付文档 §十）

演示环境「自审」；非 `done` 的既存 `pending` 缺口不修；「今日到期/待我审核」双计；完成提报无「撤回」路径；`SUBMISSION_TRANSITIONS` 未覆盖 `approved → pending`；单用户演示 + 内存库刷新复位；拖拽手势层无自动化测试；构建产物 `dist-v4` 待清理。
