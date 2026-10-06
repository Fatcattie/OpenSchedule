# OpenSchedule 移动端 · 增量 4 交付概览

> 日期：2026-09-27 · 交付人：齐活林（交付总监）· 路径：`apps/mobile`
> 一句话：**新增「撤回提报」入口**（已提交的完成提报可退出审核队列、任务回到「进行中」），并**修正「重开为进行中」按钮标签与实际行为不符**的缺陷。

---

## 做了什么

原定三件事，**实读后只有一件需要写代码** —— 另两件被判定为「不该做」，避免两次语义退化：

| # | 事项 | 结论 |
| --- | --- | --- |
| ① | 列表内容互斥 | **不做** —— 用户可见的**错误数字已在增量 3 消除**，残留只是徽标之和；三组是**三种视角**不是划分，互斥会让每个列表不再符合自身定义（「临期预警排除今日到期」= 把最紧急的今日任务从预警里拿掉）；且实测**不是包含关系而是交叉重叠**，「排除被包含者」的修法根本不适用 |
| ② | 非 `done` 的 `pending` 收口 | **不做** —— 该组合是**合法态**（命名为「**审核轮回态**」）。由产品自己在「撤销审核通过」流程中写入，被 4 个测试套件保护。判据的不对称是**语义正确的**：非 `done` 的 `pending` 下任务仍在推进，离开状态不应静默杀死一个待审提报 |
| ③ | 「完成提报」撤回入口 | **做** —— 新增 `withdrawCompletion` + 详情页入口 |
| ＋ | **「重开为进行中」标签/行为不符**（我推翻 PM 裁定后纳入） | **做** —— `runTransition` 的 `done` 分支拆分 |

---

## 关键决策

- **主体判定修正（本次修复的核心缺陷）**：`isWithdrawable` 由单主体 `createdBy` 改为**分叉主体** —— `completion` 分支取 `assigneeId ?? createdBy`。修正前对 `task-014` 而言「**真正的提报人李娜无权撤回，从未提报的张伟却有权**」。
- **只清理审核态、只在 `done` 时改状态**：从 `done` 撤回 ⇒ 落 `in_progress`（`completedAt = null`，INV-1）；非 `done` ⇒ **不改 `status`**（避免 `in_progress → in_progress` 非法自迁移 40902）。
- **复用唯一构造点** `createClearedReviewState()`，禁止在 service 内手写第二份字段清单。
- **零通知**（硬约束：不得动通知系统；与 `undoCompletion` 零通知口径一致）。
- **我推翻 PM 的一处裁定**：PM 以「回归面超出范围」为由不修「重开为进行中」；我实读发现 `grep -rln "TaskDetailScreen" tests/` **零命中**，且 `tests/increment2-completion.test.ts:190-205` **已直接断言** `moveTask(done → in_progress)` 正确（六字段全清 + 退出待审队列，当前全绿）⇒ 正确实现**已存在且被测试锁定**，改 UI 分支回归面**为零**。架构师复核后同意纳入。

---

## 交付概览

| 项 | 值 |
| --- | --- |
| 交付状态 | ✅ **可验收**（QA 判定 `NoOne`） |
| 源码改动 | **6 改**（其中 2 个为**纯注释、零行为变更**） |
| 新增测试 | 2 个文件（工程师 1 + QA 1，QA 55 用例） |
| `tsc --noEmit` | **exit 0** |
| 全量测试 | **33 套件 / 586 用例全绿**（基线 31 / 502） |
| 浏览器 E2E | 撤回链路 + 两条重开分支全部 PASS，控制台 **0 error** |
| 已知问题 | P0 × 0、P1 × 0、P2 × 1（**QA 自身文件断言 bug，第 1 轮内自修**）；P3 × 6（登记不修） |
| 新增依赖 | **0** |

**浏览器实证亮点**：完成提报后「撤回提报」入口出现 → 确认撤回 → 状态回到**「进行中」而非「待办」**且待审核标签消失；**「重开为进行中」落点 = 进行中**（修复生效），**「重开为待办」落点 = 待办**（对照组，分支未变）。

---

## 文件清单

**源码**
- `apps/mobile/src/utils/submission.ts`（`isWithdrawable` 分叉 + 审核轮回态注释）
- `apps/mobile/src/services/task.service.ts`（新增 `withdrawCompletion`）
- `apps/mobile/src/services/index.ts`（桶文件导出）
- `apps/mobile/src/screens/TaskDetailScreen.tsx`（撤回入口 + `runTransition` 分支拆分）
- `apps/mobile/src/utils/focus.ts`（纯注释）
- `apps/mobile/src/screens/TodayFocusScreen.tsx`（纯注释）

**测试**
- `apps/mobile/tests/increment4-withdraw.test.ts`（新增）
- `apps/mobile/tests/increment4-qa.test.ts`（新增，55 用例）

**文档**
- `docs/mobile-app/PRD-mobile-increment-4.md`（v1.0）
- `docs/mobile-app/ARCH-mobile-increment-4.md`（v1.0）+ 时序图 / 类图 `.mermaid`
- `docs/mobile-app/QA-mobile-increment-4.md`（第 1 轮）
- `docs/mobile-app/DELIVERY-mobile-increment-4.md`

**截图**：`screenshots/mobile/inc4-01-withdraw-entry.png`、`inc4-02-reopen-fixed.png`

---

## 用户下一步

1. 浏览器验收：**`http://127.0.0.1:4176/`**（增量 4，`dist-v7`）—— 演示账号 `zhangwei@example.com / openschedule`。
2. 对照旧版：`4175` = 增量 3、`4174` = 增量 2、`4173` = 增量 1，**四端口并行存活**。
3. 右滑手势请在**真机 / 模拟器**复验（桌面浏览器为已知盲区）。
4. `dist-v4` ~ `dist-v6` 不需要对比时可手动删除。
5. 后续候选：① 通知系统补完；② 提报状态机收口（`SUBMISSION_TRANSITIONS` 真守卫 + `withdrawSubmission` 加守卫 + 撤回通知）；③ 基础 PRD 剩余 P1/P2。
