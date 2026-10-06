# 交付说明（增量 7 / 7.1）— OpenSchedule 移动端：审核功能对标既有审核实现

> **文档版本：v7.1（终版）**（增量 7.0 交付基线 + 增量 7.1 增补登记；7.1 新增内容集中在 **§八**，前七章保持 7.0 版原文，仅在计数处同步）。**增量 7.1 已通过 QA 独立复验（结论：通过；详见 §8.6）**。**§8.3 的授权范围外改动已获用户追认（见 §8.3 决议记录 / §8.8）**
> 交付人：工程师（实现方）· 日期：2026-09-30 · 交付路径：`apps/mobile`
> 基线：`PRD-mobile-increment-7-audit-alignment.md` **v1.0**（541 行）· `ARCH-mobile-increment-7-audit-alignment.md` **v1.0**（878 行）
> 上游：`DELIVERY-mobile-increment-5.md` §7（已知限制登记）+ 增量 6 审核框架
> 实现依据：ARCH §0（D1–D6 / M1–M3 拍板）+ §2.6（**唯一被授权的既有断言改动清单**）+ §6（T01–T05 任务分解）
> 施工范围：`apps/mobile`（D1）；**不改后端 / web**；**零新依赖**（`package.json` 零改动）

---

## 一、TL;DR

把移动端从「提报 = 提报记录」升级为**与后端 / web 同构的审核实现**：引入存储态 `pending_review`（D4）、严格完成分流 `needsReview = reviewRequired && !isReviewTask`（M1）、评审子任务自动生成 / 复用、结构化审核留痕 `AuditLog`、审批门禁（M2）、看板「待评审」列（M3），并新建**独立「审核中心」页**承载「待提报 / 待审核 / 审核通过 / 撤回审核」四栏（D5 / D6）。

- 交付状态：**✅ 可验收**（T01–T05 全部完成）
- 测试：`tsc --noEmit` **exit 0（零错误）**；`jest` **39 套件 / 759 用例全绿**（基线 38 套件；本次新增 1 套件 `audit-center.test.ts` 29 用例）
- 既有断言改动：**严格限定在 §2.6 授权范围**内 —— 分类 A 4 条 + B 14 条 + C 4 条 + G 2 条 + H 2 条 = **26 条**，加 **2 处源码不变式**（分类 D）；另有 **2 条被纠正（架构师初版误判，实际未改）** 与 **8 条 §2.6 未列但必需的新增改动**（详见 §三）
- 已知问题：P0 × 0 · P1 × 0 · P2 × 0；P3 × 6（登记不修，见 §六）
- 新增依赖：**0**
- 未执行任何 `git` 操作

**增量 7.1 增补（v7.1，详见 §八）**：修复「评审子任务孤儿」（Route 2，A）+「取消评审子任务 → 驳回 → 重新提报」耦合缺陷（C + E 同修）+ 补 `AuditCenterScreen` 组件渲染测试（B，补 §6-T03 欠账）。

- 既有断言改动 **34 → 35 条**（新增 **R1** = `increment4-qa.test.ts:358` / `:374` 过滤收窄，属 **🔴 授权范围外改动**，已向用户披露、**待用户确认**）+ 源码不变式 2 处（D）= **37 改动点**
- 新增用例 **12 条** = R-1~R-6（6）+ S-1/S-2（2）+ T-1~T-4（4）；新增文件 **1 个**（`tests/audit-center-render.test.tsx`）
- 验收基线 **39 套件 / 759 用例 → 40 套件 / 771 用例** + `tsc --noEmit` 零错误
- D 项核销（撤回后 `submissionStatus` 落 `'withdrawn'`）＝ **非缺陷（有意差异 INV-8），不改**；C 项定性 = **真实可达缺陷修复**（**非**防御性硬化）
- QA 复验：**✅ 通过**（`QA-mobile-increment-7.1-audit-alignment.md`，206 行；P0/P1/P2 × 0，4 项非阻塞存疑建议接受现状；变异测试 **6/6 命中**；详见 §8.6）

---

## 二、改动文件清单

### 2.1 源码：4 新增 / 13 修改

**新增（4）**

| # | 文件 | 职责 |
| --- | --- | --- |
| 1 | `src/utils/audit.ts` | 审核域**派生纯函数** + 四栏筛选 + 常量表。导出：`deriveApprovalStatus` / `deriveApprovalType` / `derivePendingReview` / `canApproveMainTask` / `isTaskRelated` / `lastApproveLog` / `filterPendingReport` / `filterPendingAudit` / `filterApproved` / `filterWithdrawnLogs` / `OPINION_OPTIONS` / `OPINION_META` / `APPROVAL_STATUS_LABEL` / `AUDIT_ACTION_LABEL` / 类型 `ApprovalStatus` / `ApprovalType` / `DateRange`。**纯函数、不落库、不改写既有字段** ⇒ 对既有套件零回归 |
| 2 | `src/services/audit.service.ts` | `listAuditTasks(actorId, isManager)`（相关任务口径）+ `resolveIsManager(actorId)` + `submitAudit(input)`（编排 approve/reject → `reviewSubmission`；withdraw → `withdrawCompletionAndNotify`）；类型 `SubmitAuditAction` / `SubmitAuditInput`；保留 `TODO(real-api)` |
| 3 | `src/screens/AuditCenterScreen.tsx` | 审核中心四栏页：`ScreenHeader` + `SegmentedControl`（四栏 + 角标）+ 日期区间（两个 `DateTimeField`）+ `TaskCard` / `AuditLogItem` 列表 + `EmptyState` + 审核 `BottomSheet`（动作单选 / 意见四选 / 原因，`other` 必填 ≥4）+ Toast；角色门禁 `useCan('review:view_pending')` |
| 4 | `src/components/AuditLogItem.tsx` | 「撤回审核」栏日志条目卡片（任务标题 + 意见标签 + 动作标签 + 操作人 + 时间），点击进任务详情 |

**修改（13）**

| # | 文件 | 改动 | 行为变更 |
| --- | --- | --- | --- |
| 1 | `src/types/task.ts` | ① `TaskStatus` 增 `'pending_review'`（六态）；② 新增 `AuditAction` / `AuditOpinion` / `AuditLog` 类型 + `Task.auditLogs?: AuditLog[]`；③ `TASK_TRANSITIONS` 增 T10/T11/T12 边与 `pending_review` 键（`in_progress`/`blocked` 增 `→ pending_review`；`pending_review: ['done','in_progress','todo']`）；④ `TASK_TRANSITION_ACTIONS.pending_review: []`（审批 / 提报走专用入口，刻意不暴露通用迁移）；⑤ `BOARD_COLUMNS` 增「待评审」列（M3）；⑥ `CreateTaskInput` 增 `reviewRequired?: boolean`（M1） | 是 |
| 2 | `src/types/navigation.ts` | `MainRootStackParamList` 增 `AuditCenter: undefined` | 否 |
| 3 | `src/theme/index.ts` | `statusColor` 增 `pending_review: { color:'#C8871B', bg:'#FBF3E2', label:'待评审' }`；`boardColumnOrder` 增 `'pending_review'`（置于 `blocked` 与 `done` 之间，M3） | 是（看板列） |
| 4 | `src/data/seed.ts` | **仅 4 条**种子任务各增 `reviewRequired: true`：`task-004`(:269) / `task-005`(:290) / `task-006`(:311) / `task-009`(:368)。**`task-014` / `task-015` 及提报记录 `task-019`~`task-023` 原有该标志，未改动** | 是（演示 / 既有测试语义保留） |
| 5 | `src/utils/submission.ts` | `shouldClearReviewOnLeaveDone` 判据扩展为「完成态 = `{done, pending_review}`」；同步改写上方注释（`:180-188`、`:190-200`）为「完成态 = {done, pending_review}」，**保留**「不得给 `moveTask` / `reopenTask` 新增清理分支」约束 | 是（清理覆盖 `pending_review`） |
| 6 | `src/services/task.service.ts` | **核心**：① `STATUS_WEIGHT` 增 `pending_review: 3`；② `listDeadlineApproaching` 显式排除 `pending_review`；③ `completeTask` 严格分叉（M1）；④ `CreateTaskInput` 增 `reviewRequired?`，`insertTask` 写 `input.reviewRequired ?? false`；⑤ `withdrawCompletion` 状态块覆盖 `pending_review`；⑥ `reviewSubmission` 增 `actorId?` / `opinion?` 尾参 + 写 `AuditLog`；⑦ `withdrawCompletionAndNotify` 增 `opinion?` + 包装层写撤回日志；⑧ **文件末尾**新增 `appendAuditLog` / `ensureReviewSubtask` | 是 |
| 7 | `src/services/index.ts` | `export * as auditService`；导出 `SubmitAuditInput` / `SubmitAuditAction` | 否 |
| 8 | `src/components/index.ts` | 导出 `AuditLogItem` / `AuditLogItemProps` | 否 |
| 9 | `src/navigation/stacks.tsx` | 根共享栈注册 `<MainRootStack.Screen name="AuditCenter" component={AuditCenterScreen} />` | 是（新增路由） |
| 10 | `src/screens/ProfileScreen.tsx` | 「我的」页增「审核中心」`SettingRow`（icon `clipboard`），仅 `can('review:view_pending')` 可见 | 是（新增入口） |
| 11 | `src/screens/TodayFocusScreen.tsx` | 修正既有缺陷：**B1** `:566` 驳回按钮阈值 `< 2` → `< REASON_MIN_LENGTH`；**B2** `handleRejectConfirm` 补 `catch`（`showToast(getErrorMessage(error))`）+ `finally` 内 `await focus.refetch()` | 是（缺陷修复） |
| 12 | `src/screens/TaskDetailScreen.tsx` | `canClaim` 防御性排除 `pending_review`（`:348-349`） | 否（实际恒 false） |
| 13 | `src/screens/CreateItemScreen.tsx` | 增「需要评审」开关（仅 manager 且 `kind === 'task'` 时渲染，`Switch`）；本地 `useState`（**不**并入 `ItemFormValue`）；`createTask(...)` 透传 `reviewRequired`；deps 增 `reviewRequired` | 是（M1 的 UI 唯一入口） |

> **`withdrawCompletion` 函数体**继续「零通知」（K24/K27 边界）；新函数 `appendAuditLog` / `ensureReviewSubtask` **置于文件末尾**（`todayAt` 之后），**未**插在 `withdrawCompletion` 与 `reviewSubmission` 之间，**未**置于 `reviewSubmission` 之前（K38 / 2 处源码切片断言保持）。

### 2.2 测试：1 新增 / 10 修改

| # | 文件 | 归属 | 用例数 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | `tests/audit-center.test.ts` | 工程师（**新增**） | **29** | 派生纯函数全分支 + 四栏筛选（含 D6 宽口径、日志流倒序）+ 评审子任务生成 / 复用 + M1 分流对照 + M3 看板列 + `AuditLog` + `auditService` |
| 2 | `tests/increment2-qa.test.ts` | **授权改动**（§2.6 A / B + 新增） | 19 | 见 §三 |
| 3 | `tests/increment2-completion.test.ts` | **授权改动** | 27 | 见 §三 |
| 4 | `tests/increment3-dedup-notify.test.ts` | **授权改动** | 31 | 见 §三（含 P1 通知计数） |
| 5 | `tests/increment3-qa.test.ts` | **授权改动** | 22 | 见 §三（含 P1 通知计数） |
| 6 | `tests/increment4-qa.test.ts` | **授权改动** | 55 | 见 §三 |
| 7 | `tests/increment4-withdraw.test.ts` | **授权改动** | 23 | 见 §三 |
| 8 | `tests/increment5-qa.test.ts` | **授权改动** | 51 | 见 §三（含 P2 显式恢复 `reviewRequired`） |
| 9 | `tests/increment5-closure.test.ts` | **授权改动** | 31 | 见 §三 |
| 10 | `tests/services.test.ts` | **授权改动** | 26 | 见 §三 |
| 11 | `tests/task-state-machine.test.ts` | **授权改动**（§2.6 G / H） | 18 | 见 §三 |

> 其余既有套件（除上述 10 个文件外）**断言零改动**。受改动套件内相关 `it` 标题同步补注了增量 7 语义（纯文案，不含判定变更）。

### 2.3 文档

| 文件 | 版本 | 说明 |
| --- | --- | --- |
| `PRD-mobile-increment-7-audit-alignment.md` | v1.0 | 需求依据（本次未改） |
| `ARCH-mobile-increment-7-audit-alignment.md` | v1.0 | 架构 / 任务分解（本次未改） |
| `DELIVERY-mobile-increment-7-audit-alignment.md` | **本文件** | 交付说明 |

---

## 三、既有断言最终改动逐条

> **总览**：§2.6 声称「28 条断言 + 2 处源码不变式」。**实读修正后**：
> - §2.6 的 **2 条期望值有误**（`increment2-qa` / `increment5-closure` 各 1 条，架构师初版误判）⇒ **实际不改**，故分类 B 由 16 条降为 **14 条**；
> - §2.6 **漏列 8 条**（P2 5 条 + P1 3 条）⇒ 必须补改。
> - **最终落点 = 26 条既有断言（A4 + B14 + C4 + G2 + H2）+ 2 处源码不变式（D）= 28 个改动点 + 8 条补漏**。
> - **7.1 增补（v7.1）**：新增 **1 条**既有断言收窄（分类 R 的 **R1** = `increment4-qa.test.ts:358` / `:374`）⇒ **既有断言改动合计 = 34 → 35 条**；加 2 处源码不变式（D）= **37 个改动点**。**该条超出用户既有授权范围**，已披露、待确认（详见 §八 / §8.3）。

### 3.1 分类 A：INV-1 放宽（4 条，全部按 §2.6 执行）

| 文件:行（终稿） | 原断言 | 改成 | 为什么必须改 |
| --- | --- | --- | --- |
| `tests/increment2-qa.test.ts:25` | `expect(task.completedAt !== null).toBe(task.status === 'done')` | `… === (task.status === 'done' \|\| task.status === 'pending_review')` | `pending_review` 任务 `completedAt != null` 但 `status !== 'done'` ⇒ 恒失败（INV-1 放宽） |
| `tests/increment4-qa.test.ts:63` | `(task.completedAt != null) !== (task.status === 'done')` | `… !== (task.status === 'done' \|\| task.status === 'pending_review')` | 同上（全量遍历，判据在 `:63`） |
| `tests/increment5-qa.test.ts:671`（INV-5） | `(task.completedAt != null) !== (task.status === 'done')` | 同上（放宽为二态集合） | 同上 |
| `tests/increment2-completion.test.ts:265` | `expect(done.completedAt !== null).toBe(done.status === 'done')` | `… === (done.status === 'done' \|\| done.status === 'pending_review')` | `done` 为 `completeTask` 结果 ⇒ 现为 `pending_review` + `completedAt` 非空 |

### 3.2 分类 B：`completeTask` 结果状态 `done → pending_review`（**14 条**；§2.6 原列 16 条，其中 2 条被纠正，见 §3.7）

> 根因单一：`completeTask` 对 `needsReview === true` 的任务由 `done` 改判为 `pending_review`。**`moveTask`→`done` 的断言全部保持**。

| # | 文件:行（终稿） | 原断言 | 改成 |
| --- | --- | --- | --- |
| 1 | `tests/increment2-completion.test.ts:253` | `expect(done.status).toBe('done')` | `.toBe('pending_review')` |
| 2 | `tests/increment2-qa.test.ts:319` | `expect(after.status).toBe('done')`（completeTask 后） | `.toBe('pending_review')` |
| 3 | `tests/increment2-qa.test.ts:343` | `expect(after.status).toBe('done')`（completeTask 后） | `.toBe('pending_review')` |
| 4 | `tests/increment3-dedup-notify.test.ts:228` | `expect(done.status).toBe('done')` | `.toBe('pending_review')` |
| 5 | `tests/increment3-qa.test.ts:192` | `expect(done.status).toBe('done')` | `.toBe('pending_review')` |
| 6 | `tests/increment4-qa.test.ts:246` | `expect(done.status).toBe('done')` | `.toBe('pending_review')` |
| 7 | `tests/increment4-qa.test.ts:533` | `expect(done.status).toBe('done')`（blocked→完成提报） | `.toBe('pending_review')` |
| 8 | `tests/increment4-withdraw.test.ts:139` | `expect(done.status).toBe('done')` | `.toBe('pending_review')` |
| 9 | `tests/increment4-withdraw.test.ts:167` | `expect(after.status).toBe('done')`（completeTask 后） | `.toBe('pending_review')` |
| 10 | `tests/increment5-closure.test.ts:224` | `expect(done.status).toBe('done')` | `.toBe('pending_review')` |
| 11 | `tests/increment5-closure.test.ts:282` | `expect(done.status).toBe('done')` | `.toBe('pending_review')` |
| 12 | `tests/increment5-qa.test.ts:313` | `expect(done.status).toBe('done')` | `.toBe('pending_review')` |
| 13 | `tests/increment5-qa.test.ts:377` | `expect(done.status).toBe('done')` | `.toBe('pending_review')` |
| 14 | `tests/services.test.ts:126` | `expect(done.status).toBe('done')`（completeTask） | `.toBe('pending_review')` |

> **未改（保持）**：`expect(approved.status).toBe('done')`（approve 结果，如 `increment2-completion.test.ts:358,395,438`、`increment2-qa.test.ts:185`、`increment4-withdraw.test.ts:195,203`、`increment5-qa.test.ts:358`、`round2-regression.test.ts:48`、`services.test.ts:174`）；`moveTask`→`done`（如 `increment2-qa.test.ts:100`、`services.test.ts:97`）。

### 3.3 分类 C：源码切片 / 判据行断言（4 条）

| 文件:行（终稿） | 原断言串 | 改成 | 为什么必须改 |
| --- | --- | --- | --- |
| `tests/increment4-qa.test.ts:616-620` | `"return task.status === 'done' && nextStatus !== 'done' && task.submissionStatus === 'pending'"` | `"(task.status === 'done' \|\| task.status === 'pending_review') && nextStatus !== 'done' && nextStatus !== 'pending_review' && task.submissionStatus === 'pending'"` | `shouldClearReviewOnLeaveDone` 须覆盖 `pending_review`（离开完成态清理） |
| `tests/increment4-qa.test.ts:632-641` | `"if (task.status === 'done' \|\| task.status === 'cancelled') return false"` | `"if (task.status === 'done' \|\| task.status === 'cancelled' \|\| task.status === 'pending_review') return false"` | 新增 `pending_review` 排除（§2.5-3） |
| `tests/increment5-qa.test.ts:588` | 同上（`listDeadlineApproaching` 串） | 同上 | 同上 |
| `tests/increment5-closure.test.ts:429` | 同上（`listDeadlineApproaching` 串） | 同上 | 同上 |

> **同步改了源码注释**（否则代码与注释自相矛盾）：`src/utils/submission.ts:180-200` 两处注释改写为「完成态 = `{done, pending_review}`」，**保留**「不得给 `moveTask` / `reopenTask` 新增清理分支」约束。

### 3.4 分类 G：状态机常量 / 双射（2 条，§2.6 新发现）

| 文件:行（终稿） | 原断言 | 改成 | 为什么必须改 |
| --- | --- | --- | --- |
| `tests/task-state-machine.test.ts:18-25` | `ALL_STATUSES = ['todo','in_progress','blocked','done','cancelled']` | 增 `'pending_review'`（第 6 项） | `Object.keys(TASK_TRANSITIONS)` 现为 6 键 ⇒ `:82-84` 恒失败 |
| `tests/task-state-machine.test.ts:96-107` | 「每条合法迁移都有对应可点动作（无遗漏）」对全部状态双向检查 | 反向「无遗漏」断言**限定为不含 `pending_review` 的迁移**（`from === 'pending_review'` / `to === 'pending_review'` 跳过）；正向「动作目标 ⊆ 合法迁移」保持不变 | `pending_review` 及其相关边**刻意不暴露**通用 UI 动作（审批 / 提报走审核中心专用入口）⇒ 反向断言对其不成立 |

> 被否决的替代方案（ARCH §2.2）：给 `TASK_TRANSITION_ACTIONS.pending_review` 填真实动作以维持双射 —— 会让 `TaskDetailScreen` 经 `runTransition → moveTask` 绕过 `reviewSubmission`，语义错误，不采纳。

### 3.5 分类 H：M3 新增「待评审」看板列（2 条）

| 文件:行（终稿） | 原断言 | 改成 |
| --- | --- | --- |
| `tests/services.test.ts:259-265` | `columns.map(c => c.status)` → `['todo','in_progress','blocked','done']` | `['todo','in_progress','blocked','pending_review','done']` |
| `tests/task-state-machine.test.ts:133-141` | `BOARD_COLUMNS.map(c => c.status)` → `['todo','in_progress','blocked','done']` | `['todo','in_progress','blocked','pending_review','done']` |

> **交叉核对仍通过**：`services.test.ts:266-270`（`total === 非 cancelled 任务数`）与 `submission-flow.test.ts:309-310`（提报记录不上看板）保持通过 —— 种子无 `pending_review` 任务，新增列初始为空，且提报记录被 `isSubmissionRecord` 过滤。

### 3.6 分类 D：2 处源码不变式（非测试断言，但属 INV-1 保护点）

| 文件:行（终稿） | 现状 → 改成 |
| --- | --- |
| `src/services/task.service.ts:1076-1079`（`withdrawCompletion` 状态块） | `if (task.status === 'done') { assertTransition('done','in_progress'); … }` → `if (task.status === 'done' \|\| task.status === 'pending_review') { assertTransition(task.status,'in_progress'); task.status='in_progress'; task.completedAt = null }`；注释改为放宽版 INV-1。**未**出现 `reviewRequired: false` / `reviewerIds: []` / `reviewNote: null` / `'cancelled'` / `pushNotification`（`increment4-qa.test.ts:560-577`、`increment4-withdraw.test.ts:343-366` 的禁串断言保持） |
| `src/services/task.service.ts:1180-1181`（`reviewSubmission` reject） | 逻辑不变（reject 目标恒 `in_progress`，清 `completedAt` 正确）；**仅更新注释**为放宽版 INV-1 |

### 3.7 🔴 纠正的 2 条（**架构师初版误判 —— 实际未改**）

> §2.6 分类 B 把这两条列为「`done` → `pending_review`」。**实读后判定：不该改。**
> 原因：两条用例都走「**先 `completeTask` → 再 `undoCompletion` / `withdrawCompletion` → 再 `completeTask`**」路径。`undoCompletion` / `withdrawCompletion` 内部经**唯一清理构造点** `createClearedReviewState()`（`utils/submission.ts:149-158`）把 `reviewRequired` 清为 `false` ⇒ 第二次 `completeTask` 时 `needsReview === false` ⇒ **落 `done`**（非 `pending_review`）。若按 §2.6 改成 `pending_review`，用例**必然失败**。

| # | 文件:行（终稿） | §2.6 的错误要求 | **最终（正确）** | 判定依据 |
| --- | --- | --- | --- | --- |
| 1 | `tests/increment2-qa.test.ts:157`（终稿 `:158`） | `expect(again.status).toBe('done')` → 改 `pending_review` | **保持 `expect(again.status).toBe('done')`** | undo 清 `reviewRequired` ⇒ 第二次完成 `needsReview === false` ⇒ `done` |
| 2 | `tests/increment5-closure.test.ts:383` | `expect(redo.status).toBe('done')` → 改 `pending_review` | **保持 `expect(redo.status).toBe('done')`** | withdraw 清 `reviewRequired` ⇒ 再次完成 `needsReview === false` ⇒ `done` |

> 这两条同时是 **M1 的必然结果**：`reviewRequired` 由创建期决定、`completeTask` 只读不改 —— 一旦被 `createClearedReviewState()` 清为 `false`，任务就**永久退出评审队列**（除非再次由创建期显式置回）。该语义已由**用户拍板确认**（见 §3.8 P2-5 的处置）。

### 3.8 🆕 新增的 8 条（**§2.6 未列，但为 M1 语义 / 用户拍板 P1·P2 所必需**）

> 这 8 条**不在** §2.6 授权清单内，但**不改则套件必然失败** —— 根因是 §2.6 的清单**漏列**了「M1 分叉的连带影响」与「评审子任务通知的连带影响」。已按「保持 ARCH 行为 + 最小必要断言修正」原则处理（经 team-lead 确认）。

#### P2 组（5 条）：undo / 撤回后 `reviewRequired` 被清 ⇒ 再完成落 `done`、不再入队

| # | 文件:行（终稿） | 原断言 | 改成 | 为什么必须改 |
| --- | --- | --- | --- | --- |
| P2-1 | `tests/increment2-qa.test.ts:159-161` | `submissionStatus` = `'pending'`；`reviewRequired` = `true`；`listPendingReview` 命中 = `true` | `submissionStatus` = `null`；`reviewRequired` = `false`；`listPendingReview` 命中 = `false` | 第二次完成走 `needsReview === false` 分支 ⇒ 不写提报态、不入队 |
| P2-2 | `tests/increment2-completion.test.ts:347-349` | 同上三条 | 同上三条 | 同上（不同种子任务 `task-004`） |
| P2-3 | `tests/increment3-dedup-notify.test.ts:419-420`（AC-07） | `mineAfter` 长度 = `2`；未读 = `1` | 长度 = `1`；未读 = `0` | 第二次完成不派发 `review.pending` ⇒ 无新通知（原「已读后重新提交 +1」语义随 M1 失效） |
| P2-4 | `tests/increment5-closure.test.ts:384-385`（AC-15） | `submissionStatus` = `'pending'`；`reviewRequired` = `true` | `submissionStatus` = `'withdrawn'`；`reviewRequired` = `false` | 撤回后 `submissionStatus='withdrawn'` 未被改写（不走提报分支） |
| P2-5 | `tests/increment5-qa.test.ts:222-224`（AC-05a） | （原路径直接依赖撤回后仍可重新提报） | **新增一行** `findTask('task-014')!.reviewRequired = true`（+ 2 行注释），显式恢复创建期标志后再 `completeTask` | **保留 AC-05a 的「未读级去重」覆盖**：撤回清标志后无法自然重提，故显式恢复（等价于「管理员创建任务时勾选需评审」） |

> **P2-5 是本组唯一「加行」而非「改期望值」的一条**：它把「撤回后不能自然重提」这一 M1 语义**显式登记在用例里**，避免去重用例被静默削弱。

#### P1 组（3 条）：评审子任务承接人须收 `task.review.pending`（用户拍板）

| # | 文件:行（终稿） | 原期望 | 改成 | 为什么必须改 |
| --- | --- | --- | --- | --- |
| P1-1 | `tests/increment3-dedup-notify.test.ts:340` | `db.notifications.length` = `before + allManagerIds().length` | `before + allManagerIds().length + 1` | `completeTask` 除向审核人发 `review.pending` 外，**还向评审子任务承接人**（`project-001` 负责人 = ME）发 1 条 `task.review.pending`（`data.taskId` = 子任务 id，不计入上面的 `created`） |
| P1-2 | `tests/increment3-dedup-notify.test.ts:380`（AC-12） | 未读数 = `unreadBefore + 1` | `unreadBefore + 2` | ME 既收主任务 `review.pending`（本人是审核人），又收评审子任务 `task.review.pending` ⇒ 未读 +2 |
| P1-3 | `tests/increment3-qa.test.ts:421`（AC-12） | 未读数 = `5` | `6` | 同上（基线未读 4 + 2） |

> 相关**未改**断言：`increment3-dedup-notify.test.ts:337`（`created` 条数 = `beforePending + allManagerIds().length`，`created` 仅按 `data.taskId = DUE_TASK_ID` 过滤，子任务通知不计入）与 `:389`（`total = allManagerIds().length`）保持通过。

### 3.9 统计与「受保护断言」复核

| 维度 | 结果 |
| --- | --- |
| §2.6 授权断言（实际落点） | **26 条** = A 4 + B 14 + C 4 + G 2 + H 2 |
| §2.6 授权源码不变式 | **2 处**（分类 D） |
| 纠正（不该改） | **2 条**（§3.7） |
| §2.6 漏列、本次补改 | **8 条**（§3.8：P2 5 + P1 3） |
| **7.1 增补 · 既有断言收窄** | **1 条**（分类 R 的 **R1** = `increment4-qa.test.ts:358` / `:374`；🔴 **超出用户既有授权范围**，见 §8.3） |
| **既有断言改动合计（7.1 后）** | **35 条**（26 + 8 + 1） |
| **改动点合计（含源码不变式）** | **37 个**（35 + 2 处源码不变式 D） |
| **7.1 新增用例** | **12 条**（R-1~R-6 = 6 + S-1/S-2 = 2 + T-1~T-4 = 4） |
| **7.1 新增文件** | **1 个**（`tests/audit-center-render.test.tsx`） |
| 涉及既有测试文件 | **10 个**（与 §2.6 一致；7.1 的 R1 落在已在列的 `increment4-qa.test.ts`，不新增文件） |
| 未授权的「受保护断言」 | ✅ 全部逐字在位：`canTransition('approved','pending')` 终值仍 `true`（`increment4-qa.test.ts:522`）；`moveTask`→`done`、`approve`→`done`、`reopenTask`、`requireReason`、`REASON_MIN_LENGTH=4`、源码切片禁串等**一字未改** |
| `it` 标题 | 受改动套件内相关标题同步补注增量 7 语义（**纯文案**，不含判定变更） |

---

## 四、偏离 ARCH 登记（4 处）

> ARCH §2.6 / §4 / §5 未逐字规定下列细节，实现时按「保持既有行为 + 最小侵入」处理。team-lead 简报中记为「三处」，实读清点为 **4 处**（第 4 处为审计动作名，影响面最小）。

| # | 偏离点 | ARCH 原文 | 实际实现 | 理由 / 影响 |
| --- | --- | --- | --- | --- |
| **c1** | `reviewSubmission` 增可选尾参 | §4.5 调用示例 `reviewSubmission(id,'approve',v)`；§2.6 未授权改签名 | 签名扩为 `(taskId, action, version, reason?, actorId?, opinion?)` | 为落地 **B3 修正**（`operatorId` = 真实操作人，替换 `reviewerIds[0]`）与 `AuditLog.opinion` 留痕。**可选参数，向后兼容**，既有调用点零改动 |
| **c2** | `withdrawCompletionAndNotify` 增 `opinion?` + 包装层写撤回日志 | §4.3 只规定「三个动作写 `AuditLog`」，未定撤回日志的写入位置 | 包装层在 `withdrawCompletion` 之后对**活引用 `task`** 调 `appendAuditLog(task,'withdraw',opinion ?? 'other',…)` | `withdrawCompletion` 返回浅拷贝快照，在其上追加不落库；写活引用才能持久化。`withdrawCompletion` 函数体保持**零通知、零日志**（K24/K27 边界） |
| **c3** | approve 时 `completedAt = task.completedAt ?? now()` | §2.3 定「审批通过 → `completedAt` **保持**（不覆写）」 | 改为「**保持；若为空则补 `now()`**」 | 兜底：`task-014` 等种子任务直接 `approve`（未经 `completeTask`）时 `completedAt` 为空，若严格「保持」会留下 `status='done'` 但 `completedAt=null` ⇒ **破坏放宽后的 INV-1**。`??` 保证 INV-1 恒成立，且不覆写已有值（准时率基准不受影响） |
| **c4** | `completeTask` 的 `pushAudit` 动作名恒为 `'task.complete'` | §2.4 伪代码 `pushAudit(needsReview ? 'task.submit_review' : 'task.complete', …)` | 恒 `'task.complete'` | `increment2-completion.test.ts:263` 的受保护断言依赖 `'task.complete'`，**不在 §2.6 授权范围内** ⇒ 不改。审核动作的语义已由结构化 `AuditLog`（`action: 'approve'\|'reject'\|'withdraw'`）承载，`pushAudit` 与 `AuditLog` **两者并存、职责分离**（PRD §7.3） |

---

## 五、验收证据

### 5.1 静态与单测（本机实跑）

```
$ npx tsc --noEmit
TSC_EXIT=0                       # 零错误

$ npx jest --config jest.config.js
Test Suites: 39 passed, 39 total
Tests:       759 passed, 759 total
Snapshots:   0 total
Time:        86.466 s
```

套件 / 用例演进：`31/502`（增量 3）→ `33/586`（增量 4）→ `35/668`（增量 5）→ **`39/759`（增量 7，新增 `audit-center.test.ts` 29 用例）**

**增量 7.1 复核（v7.1，本机实跑）**：

```
$ npx tsc --noEmit
TSC_EXIT=0                       # 零错误

$ npx jest --config jest.config.js
Test Suites: 40 passed, 40 total
Tests:       771 passed, 771 total
Snapshots:   0 total
Time:        77.691 s
```

套件 / 用例演进（续）：`39/759`（增量 7）→ **`40/771`（增量 7.1，新增 `audit-center-render.test.tsx` 4 用例 + `audit-center.test.ts` 29 → 37 用例）**

> **说明（非本交付缺陷）**：QA 正在**并行**做独立验证，运行期间会临时创建 / 删除探针文件（`tests/__qa_tmp_probe*.test.ts`）。若某次运行恰好撞上探针被删除，会报 `FAIL … ENOENT`（「Test suite failed to run」）—— 这是**探针文件的瞬时竞态**，**不计入套件数**，与本增量代码无关。剔除探针后为 **39 / 39 套件、759 / 759 用例**。team-lead 已独立复跑确认同一结果。

### 5.2 关键落点自检（逐条对齐 ARCH 硬约束）

| # | 落点 | 证据 |
| --- | --- | --- |
| 1 | `completeTask` 严格分叉 | `task.service.ts:400` `const needsReview = task.reviewRequired === true && task.isReviewTask !== true`；`:401` `target = needsReview ? 'pending_review' : 'done'` |
| 2 | 删除无条件 `reviewRequired = true` | `completeTask` 分支内仅注释「不再写」（`:413`），无赋值 |
| 3 | `CreateTaskInput` 增 `reviewRequired?` | `task.service.ts:782`；唯一写入点 `:820` `reviewRequired: input.reviewRequired ?? false` |
| 4 | 种子仅 004/005/006/009 | `seed.ts:269/290/311/368` 各 1 处；014/015 及 019~023 原值未动 |
| 5 | M3 四处常量 | `types/task.ts:10`（六态）、`:143`（`pending_review` 键）、`:193`（`BOARD_COLUMNS`）、`theme/index.ts:28`（`statusColor`）、`:48`（`boardColumnOrder`） |
| 6 | `shouldClearReviewOnLeaveDone` | `utils/submission.ts:205` 新判据 + `:180-200` 注释同步 |
| 7 | `listDeadlineApproaching` 守卫 | `task.service.ts:262` 含 `\|\| task.status === 'pending_review'` |
| 8 | `withdrawCompletion` 状态块 | `task.service.ts:1076-1079` |
| 9 | 函数定义顺序硬约束 | `withdrawCompletion:1055` < `reviewSubmission:1119` < `withdrawCompletionAndNotify:1220`；`appendAuditLog:1290` / `ensureReviewSubtask:1321` 在文件末尾 |
| 10 | `TASK_TRANSITIONS` / `TASK_TRANSITION_ACTIONS` | `types/task.ts:139-143` / `:182` |
| 11 | 评审子任务字段 | `ensureReviewSubtask`：`title='项目评审 — {title}'`、`status='todo'`、`priority='high'`、`source='published'`、`reviewRequired=false`、`isReviewTask=true`、承接人 `project.ownerId ?? createdBy`、复用优先 |
| 12 | 评审子任务通知 | `task.service.ts:1371-1377` `pushNotificationOnce(owner,'task.review.pending')` |
| 13 | 既有缺陷修正 / `CreateItemScreen` 开关 | `TodayFocusScreen.tsx:566`（B1 阈值）+ `:283-303`（B2 补 catch + refetch）；`TaskDetailScreen.tsx:348-349`（canClaim 排除）；`CreateItemScreen.tsx:189-199`（「需要评审」开关） |
| 14 | 硬约束 | 零新依赖（`package.json` 零改动）；无 `reanimated` / `gesture-handler`；样式取 `tokens`；裸 `<Pressable>` 白名单仍为 6 文件（`checkin-card-lift` / `increment-ui-polish` 套件全绿） |

---

## 六、未决与后续项

### 6.1 `TODO(real-api)` 清单（后端无 approve/reject 端点，N6）

| # | 位置 | 待联调接口 |
| --- | --- | --- |
| 1 | `task.service.ts:449` | `POST /tasks/:taskId/complete` |
| 2 | `task.service.ts:1198` | `POST /tasks/:taskId/review`（body 含 `action` / `reason` / `version` / `actorId` / `opinion`） |
| 3 | `task.service.ts:1252` | `POST /tasks/:taskId/submissions/withdraw-completion`（body 含 `notify` / `opinion`） |
| 4 | `task.service.ts:249` | `GET /tasks?scope=pending_review` |
| 5 | `audit.service.ts:47` | `GET /tasks/audit?actorId&isManager` |
| 6 | `audit.service.ts:79` | `POST /tasks/:taskId/review`（审核中心统一入口） |

### 6.2 已登记限制（P3，不修）

| # | 限制 | 说明 |
| --- | --- | --- |
| P3-1 | 撤回 / 撤销后 `reviewRequired` 被清 ⇒ 任务**永久退出评审队列**（再完成直落 `done`） | **用户已拍板确认沿用现状**（M1 的必然结果：`reviewRequired` 由创建期决定，`completeTask` 只读不改）。需重新评审时由创建期显式置回（AC-05a 已演示该路径） |
| P3-2 | `pending_review` 任务卡片保持正常样式（未加「待评审」角标） | ARCH §2.5-10 / M4 登记为可选增强（加角标会波及 UI 快照测试） |
| P3-3 | 项目统计 `doneCount` **不计入** `pending_review` | 审核通过后才进进度（ARCH §2.5-7 / M6 登记，非缺陷） |
| P3-4 | `reviewNote` 同时承载「完成提报驳回」与「评审驳回」两类语义 | ARCH §9-M9 登记；展示文案层面影响小 |
| P3-5 | 「退回重改」`opinion === 'rework'` **仅留痕**、不驱动状态 | 对齐 web（仅 `action` 驱动状态），ARCH §9-M8 登记 |
| P3-6 | 通知偏好开关未种子化 | 无 `review.pending` / `task.review.pending` 偏好项，一律发送（沿用增量 5 P3-3） |

### 6.3 建议的后续增量候选

1. `pending_review` 卡片「待评审」角标（P3-2，需同步 UI 快照断言）；
2. 撤回后**召回**已发出的「待你审核」通知（沿用增量 5 P3-2）；
3. 通知偏好开关落地（P3-6）；
4. 真实 API 联调（§6.1 六项）。

---

## 七、结论

| 维度 | 结果 |
| --- | --- |
| 交付状态 | **✅ 可验收**（T01–T05 全部完成） |
| 测试通过率 | **759 / 759 = 100%**（39 / 39 套件）；**7.1 后 = 771 / 771（40 / 40 套件）** |
| `tsc --noEmit` | **exit 0（零错误）** |
| 既有断言改动 | **严格限定在 §2.6 授权范围内**（26 条 + 2 处源码不变式）；**纠正 2 条**（架构师初版误判）；**补漏 8 条**（M1 连带 / 评审子任务通知，已获用户与 team-lead 确认）；**7.1 另加 R1 收窄 1 条（原 🔴 授权范围外，已披露并 ✅ 获追认）⇒ 合计 35 条** |
| 偏离 ARCH | **4 处**（c1–c4，均为「保持既有行为 + 最小侵入」；详见 §四） |
| 已知问题 | P0 × 0 · P1 × 0 · P2 × 0 · P3 × 6（登记）；**7.1 QA 复验：P0/P1/P2 × 0 · P3 × 4（非阻塞存疑，QA 建议接受现状，见 §8.6.6）** |
| 新增依赖 | **0**（`package.json` 零改动） |
| git 操作 | 未执行 |
| 回归基线（后续增量红线） | `tsc --noEmit` exit 0 + **40 套件 / 771 用例全绿**（7.1 后新基线；7.0 基线为 39/759）；既有断言除明确授权外一字不改 |

> **7.1 增补见 §八**：增量 7.1 的 A（孤儿消除 Route 2）/ C（复用过滤收紧）/ E（门禁排除 `cancelled`）/ B（组件渲染测试）/ 注释同步、计数更新、授权范围外改动披露、D 项核销、C 项定性修正、QA 复验占位，均登记于 **§八**。

---

## 八、增量 7.1 增补（v7.1）

> 本章为 **v7.1 增补**：登记增量 7.1（修复设计 = `ARCH-mobile-increment-7-audit-alignment.md` §2.4.2 / §2.4.3 / §2.6 分类 R·S·T）的落地内容与计数变化。**前七章保持 7.0 版原文**（仅在计数处同步为 35）。**本章不含 QA 复验结论**（见 §8.6）。

### 8.1 7.1 改动清单

**A · 评审子任务孤儿消除（Route 2 · ARCH §2.4.2）**

| 落点 | 内容 |
| --- | --- |
| `src/services/task.service.ts:1415`（**文件末尾**、`ensureReviewSubtask` 之后） | 新增 helper `closeOpenReviewSubtasks(mainTask)`：遍历 `db.tasks`，把 `parentId === mainTask.id && isReviewTask === true && status ∉ {done, cancelled}` 的子任务置 `status='cancelled'` + `version += 1` + `updatedAt`。**幂等、零通知** |
| `:369`（`moveTask`） | 既有 `if (clearReviewOnLeaveDone)` 分支内追加 `closeOpenReviewSubtasks(task)`（**不新增分支**） |
| `:475`（`reopenTask`） | 同上 |
| `:529`（`undoCompletion`） | 既有 `if (reviewReset)` 分支内追加 —— **必须绑定 `if (reviewReset)`**，**绝不可**无条件调用（否则审核轮回态被误关 ⇒ 审批死锁，守门用例 R-6） |
| `:1105`（`withdrawCompletion`） | 在 `task.submissionStatus = 'withdrawn'` **之后**追加 1 行调用（函数体内**仅**出现调用语句，**无** `'cancelled'` 字面量，保护源码切片断言） |

**C · `ensureReviewSubtask` 复用过滤收紧（ARCH §2.4.3）**

| 落点 | 改动前 → 改动后 |
| --- | --- |
| `src/services/task.service.ts:1346`（复用过滤） | `task.status !== 'done'` → `task.status !== 'done' && task.status !== 'cancelled'` |

**E · `canApproveMainTask` 门禁排除 `cancelled`（ARCH §2.4.3）**

| 落点 | 改动前 → 改动后 |
| --- | --- |
| `src/utils/audit.ts:121`（门禁过滤） | 追加 `&& child.status !== 'cancelled'`（`cancelled` 子任务视为**不阻塞** = 「取消任务 = 放弃该评审项」） |

> **⚠️ C 与 E 必须同修**：单修 C ⇒ 门禁遇 `cancelled` 仍 `false` ⇒ 审批死锁；单修 E ⇒ 复用了已取消的子任务，语义脏、评审子任务形同虚设。详见 §8.5。

**B · `AuditCenterScreen` 组件渲染测试（ARCH §2.6 分类 T，补 §6-T03 欠账）**

| 落点 | 内容 |
| --- | --- |
| `tests/audit-center-render.test.tsx`（**新增文件**） | `react-test-renderer` + `act` + `jest.mock`（照抄 `tests/project-list-fab.test.tsx` / `tests/bugfix-root-stack-back.test.tsx`；仓库**无** `@testing-library/react-native`，**未**新增依赖）。**T-1** 四栏标题与顺序（待提报 / 待审核 / 审核通过 / 撤回审核）；**T-2** 权限门禁（manager 渲染审批入口 / member 不渲染）；**T-3** 空态文案随栏位；**T-4** 门禁联动（子任务未 `done` ⇒ 阻断提示 + 「提交审核」禁用；对照组放行） |

**注释同步（纯注释、零行为变更）**

| 落点 | 内容 |
| --- | --- |
| `src/utils/submission.ts:189-190` | 追加：增量 7.1 在既有清理分支上追加的「评审子任务关闭」`closeOpenReviewSubtasks` 属数据卫生副作用，不改变本判据、不新增清理条件，不违反既有禁令 |
| `src/utils/submission.ts:202-203` | 追加：调用方在清理成立时另需调用 `closeOpenReviewSubtasks(task)`（数据卫生，ARCH §2.4.2）；该副作用**不改变本函数判据** |

### 8.2 计数更新（与 ARCH §2.6 一致）

| 维度 | 7.0 | **7.1** |
| --- | --- | --- |
| 既有断言改动 | 34 条 | **35 条**（+ 分类 R 的 **R1** = `increment4-qa.test.ts:358` / `:374` 过滤收窄） |
| 源码不变式（D） | 2 处 | 2 处（不变） |
| **改动点合计** | 36 | **37**（35 + 2） |
| 新增用例 | — | **12 条**（R-1~R-6 = 6 + S-1/S-2 = 2 + T-1~T-4 = 4） |
| 新增文件 | — | **1 个**（`tests/audit-center-render.test.tsx`） |
| 验收基线 | 39 套件 / 759 用例 | **40 套件 / 771 用例** + `tsc --noEmit` 零错误 |

> 拆解：**35 = A4 + B14 + C4 + G2 + H2 + P2-5 + P1-3 + R1**，与 ARCH §2.6 统计（35 条）**逐条一致**。

### 8.3 🔴 授权范围外改动披露（用户需知悉）

**条目：`tests/increment4-qa.test.ts:358` / `:374` 过滤收窄 —— 超出用户既有授权范围的改动**

| 项 | 内容 |
| --- | --- |
| 用户原授权范围 | 「引入 `pending_review` 所必需」的既有断言改动 |
| 本改动性质 | **7.1 孤儿修复的必然结果**（`cancelled` 是移动端**唯一**关闭态；`Task` **无** `deletedAt` 字段 ⇒ 关闭子任务只能置 `cancelled`） |
| 收窄内容 | `db.tasks.filter((task) => task.status === 'cancelled')` → 追加 `&& task.isReviewTask !== true`（`:358` 与 `:374` 各 1 处） |
| 收窄理由（**忠于原意，非放宽**） | 该用例标题原文即「无任何**正式任务** `status === 'cancelled'` 新增」（AC-10 / INV-5）；**评审子任务不是「正式任务」**，其被关闭是 §2.4.2 的**有意**行为 ⇒ 收窄过滤是**忠于用例原意**，而非放宽判据 |
| **状态** | **✅ 已披露并获用户确认 —— 用户裁定「接受收窄，保留孤儿修复」** |
| 若用户否决（**未发生**） | 孤儿修复须回退（撤销 A），仅保留 C / E |

> **决议记录（2026-09-29，用户裁定）**：用户确认**接受该断言收窄**，孤儿修复（A / Route 2）**保留**。故 R1 由「🔴 授权范围外、待确认」转为「✅ 已追认」，本交付**无未决授权事项**。追认理由：收窄忠于该用例原标题「无任何**正式任务** `status === cancelled` 新增」的**原意**（评审子任务不是「正式任务」，其被关闭是 §2.4.2 的有意行为），属**忠于原意**而非放宽判据。

### 8.4 D 项核销（撤回后 `submissionStatus` 落 `'withdrawn'`）

**结论：已核销 —— 非缺陷（有意差异 INV-8），不改。**

> 7.0 版未将 D 列为「待判断 / 未决」；本版就此**显式核销**，理由：
> 1. `deriveApprovalStatus` 的 `default → 'none'` 已把 `'withdrawn'` **正确归入「未提交」** ⇒ 撤回后任务正确回到「待提报」栏；
> 2. `tests/increment4-qa.test.ts:542` 本就**显式断言** `toBe('withdrawn')` ⇒ 归一化为 `null` 会**打破**该断言；
> 3. 归一化为 `null` 还会**破坏** `withdrawn → pending` 的放行分支（`assertSubmissionTransition`），且需改动**授权范围外**的断言。

### 8.5 C 项定性修正（真实可达缺陷修复，**非**防御性硬化）

**结论：C = 真实可达缺陷修复**（**非**「防御性硬化 / 当前不可达」）。

可达链（team-lead 已逐步实测确认）：

1. `completeTask(task-004)`（`reviewRequired === true`）⇒ 主任务 `pending_review` + 评审子任务 `todo`；
2. 用户**取消**该子任务 —— `src/screens/*` 与 `src/components/*` **零处**引用 `isReviewTask` ⇒ 子任务在 UI 里就是普通 `todo` 任务，而 `TASK_TRANSITION_ACTIONS.todo` 含「取消任务」⇒ 用户**可取消**；子任务 `cancelled`，主任务 `reviewRequired` **保持 `true`**；
3. 审核人**驳回** ⇒ 主任务回 `in_progress`，`reviewRequired` **仍为 `true`**（reject 分支不清审核态）；
4. 用户**重新提报** ⇒ `needsReview === true` ⇒ `ensureReviewSubtask` 过滤仅排除 `done` ⇒ **命中已 `cancelled` 的子任务 ⇒ 复用**（**C 缺陷真实发生**）；
5. 叠加 **E**：门禁 `.every(child => child.status === 'done')` ⇒ `cancelled !== 'done'` ⇒ **门禁永久 `false` ⇒ 审批死锁**。

**⇒ C 与 E 耦合，必须同修。**

### 8.6 QA 复验结论

> **QA 报告**：`docs/mobile-app/QA-mobile-increment-7.1-audit-alignment.md`（**206 行 / 18991 B**，第 1 轮独立验证，含变异测试）
> **结论：通过** —— 无高优先级问题（P0/P1/P2 × 0），**无需修复**；仅 4 项非阻塞存疑，QA 建议全部**接受现状**（见 §8.6.6）。
> QA 独立性声明：**不采信** team-lead 与工程师的任何结论；全部结论基于**独立复跑 + 变异测试（逐个临时回退）+ 自建反例探针 + 实读源码**。

#### 8.6.1 变异测试结果表（**6/6 全部命中，证明用例非橡皮图章**）

> 方法：逐个**临时回退**目标改动 → 运行相关套件 → 记录失败用例 → **立即恢复并 md5 校验**。

| # | 回退的改动 | 预期失败 | 实测 | 断言证据 |
| --- | --- | --- | --- | --- |
| M1 | 删 `withdrawCompletion` 的 `closeOpenReviewSubtasks`（`:1105`） | R-1 | ✅ 命中 | `audit-center.test.ts:430` 期望 `'cancelled'` 收到 `'todo'` |
| M2 | `undoCompletion` 改**无条件**调用（脱离 `if (reviewReset)`） | R-6 | ✅ 命中 | `:496` `.not.toBe('cancelled')` 收到 `'cancelled'` ⇒ **陷阱守门成立** |
| M3 | 去掉 C 的 `&& task.status !== 'cancelled'`（`:1346`） | S-1 | ✅ 命中 | `:518` 期望长度 2 收到 1 |
| M4 | 去掉 E 的 `&& child.status !== 'cancelled'`（`audit.ts:121`） | S-2 | ✅ 命中 | `:535` 期望 `true` 收到 `false` |
| M5 | 让 `withdrawCompletion` 把**主任务**写 `cancelled`（模拟 INV-5 缺陷） | `increment4-qa` 收窄断言仍失败 | ✅ 命中（**5 failed / 50 passed**） | 含 `AC-10 / INV-5`（正式任务永不被撤回写成 cancelled）全量失败、`AC-03` 收到 `'cancelled'` ⇒ **证明收窄未把断言变瞎** |
| MB | `AuditCenterScreen` 的 `canReview` 恒 `true`（绕过权限门禁） | T-2 | ✅ 命中 | member 分支期望 0 个「审核」入口收到 3 ⇒ **组件测试真守门禁** |

> **结论**：6 项回退**全部**使至少一条用例失败 ⇒ **不存在「测试通过但无效」的橡皮图章**。恢复后全量复跑回到 **40 / 771 全绿**，且被改的 3 个源文件 md5 与备份**逐一相同**。

#### 8.6.2 QA 独立探针（自建 **17 例全绿**，跑完已删）

| 分组 | 覆盖 |
| --- | --- |
| 孤儿消除四路 | 撤回 / 撤销 / `moveTask` / `reopenTask` ⇒ 子任务 `cancelled` 且 `version+1`、`updatedAt` 前移 |
| 反向（防过度修复） | 驳回后子任务**存活 + 复用同一条**（计数 1、id 不变）；**审核轮回态**子任务**存活 + 仍在 `listPendingReview`** |
| 边界 | 幂等（已 `cancelled` ⇒ 再次触发**不改 version / updatedAt**）；连调两次（人工重入 `pending_review` 后再离开）第二次不再改动；无子任务**不抛错**；已 `done` 子任务**不被关闭**；多子任务一次全关且跳过 `done` |
| **零通知** | 关闭前后 `db.notifications` 长度 `9 → 9`、类型集合**完全一致** |
| 一致性 | 看板列总数 === 非 cancelled 项目任务数（**12 === 12**）；`getProjectStats.progress = 0.1667`（2/12）；child **不进任何列表** |

#### 8.6.3 断言削弱排查（QA 独立复核，第三层）

| 排查项 | 实测 | 结论 |
| --- | --- | --- |
| `it.skip` / `xit` / `it.only` / `describe.only` / `it.todo` | 全仓 `tests/` + `src/` 搜索 ⇒ **NONE** | ✅ |
| 被注释的 `expect(` | 搜索 `// expect(` / `/* expect(` ⇒ **NONE** | ✅ |
| `increment4-qa.test.ts:357-359` / `:373-375` 收窄 | **只改 filter**（追加 `&& task.isReviewTask !== true`），`expect(cancelledAfter).toEqual(cancelledBefore)` **本体未动**；**由 M5 证明仍有效**（能捕获「撤回写 cancelled」） | ✅ 未变瞎 |
| `submissionStatus =` 赋值数 | `task.service.ts` 恰 **7 处**（`:416/:521/:955/:1032/:1103/:1157/:1193`）——**未新增** | ✅ |
| `withdrawCompletion` 切片 4 个禁用串 | `'cancelled'` / `pushNotification` / `db.notifications` / `reviewRequired: false` ⇒ **全 false** | ✅ |
| 新用例弱断言 | R-1~R-6 / S-1·S-2 / T-1~T-4 均为强断言（`toBe('cancelled')` / `toHaveLength` / `toEqual` 数组 / `accessibilityState.disabled`）；未见「只断言不抛错」「`toBeTruthy()` 兜底」 | ✅ |

#### 8.6.4 组件测试（B）真实性评价（第四层）

| 用例 | 断言内容 | 判定 |
| --- | --- | --- |
| **T-1** 四栏标题与顺序 | `mainSegments(renderer).props.options.map(label)` **逐项 `toEqual(['待提报','待审核','审核通过','撤回审核'])`** + `toHaveLength(4)` | **真**（断言标签**与顺序**） |
| **T-2** 权限门禁 | manager ⇒ `findByLabel('审核').length > 0`；member ⇒ `toHaveLength(0)` **且**任务标题仍可见（只读）；`useCan` 为**真实**权限矩阵 | **真**（变异 **MB** 证明守门禁） |
| **T-3** 空态文案随栏位 | 默认「待审核」栏含「没有待审核事项」→ 切「待提报」含「没有待提报事项」→ 切「撤回审核」含「没有驳回 / 撤回记录」 | **真**（断言文案**变化**） |
| **T-4** 门禁联动（缺陷 E） | 抽屉未开无阻断提示 → 开抽屉后含「评审子任务尚未完成，暂不可通过」+ 「提交审核」`accessibilityState.disabled === true`；**对照组**：移除未完成子任务后无提示 + `disabled === false` | **真**（断言禁用态 + **有对照组**） |

> **无「能 mount 就算过」的空壳用例。**

#### 8.6.5 主动追加探测（第五层）

| 探测点 | 实测 | 结论 |
| --- | --- | --- |
| A 的清理点是否全覆盖 | `applyClearedReviewState` 调用点 = `moveTask:368` / `reopenTask:474` / `withdrawCompletion:1102`（+ `undoCompletion` 经 `resolveUndoReviewReset` → `Object.assign`）；4 点**全部**对应 `closeOpenReviewSubtasks`（`:369/:475/:529/:1105`） | ✅ 无遗漏 |
| 其他孤儿产生路径 | 评审子任务**仅**由 `completeTask`（needsReview 分支）经 `ensureReviewSubtask` 产生；`reviewRequired` 唯一写入点 = 创建期 + `applyClearedReviewState`（4 处）⇒ 4 处已全接入 | ✅ 无未覆盖路径 |
| 共享状态污染 | `audit-center` / `increment4-qa` 均 `beforeEach(resetDatabase)`；全部 **NO-RESET** 套件**不触碰 `db.tasks`**；渲染测试 mock `@/services` 不碰真实 db | ✅ 无污染 |
| 看板 / 统计 / 列表一致性 | 看板列总数 === 非 cancelled 项目任务数（**12 === 12**）；`progress = 0.1667` ∈ [0,1]；被关闭 child 不进任何列表；主任务撤回后回 `in_progress` 正常出现 | ✅ |

#### 8.6.6 QA 的 4 项非阻塞存疑 + 建议处置（逐条登记）

| # | 存疑 | QA 建议 |
| --- | --- | --- |
| 1 | 「连调两次」公开 API 不可达（撤回后 `submissionStatus='withdrawn'`，无法二次撤回）；QA 用「人工重入 `pending_review`」构造第二次调用并验证**幂等**（`version` 不变） | **接受现状**（实质已覆盖；「字面连续两次」属测试可达性，非缺陷） |
| 2 | 关闭子任务**未通知**承接人（承接人待办里那条「项目评审 — X」静默消失） | **保持零通知**（与 ARCH §2.4.2 一致，非缺陷，产品取舍） |
| 3 | 「每轮重建 child」致 `cancelled` 行累积（反复 3 轮 = 3 条 `cancelled`，但不进看板 / 待办 / 门禁） | **接受现状**；数据敏感时另开增量归档（超出本增量范围） |
| 4 | 撤回「审核轮回态」任务也会关闭子任务（`withdrawCompletion` 无条件调用） | **接受现状**（该路径可达且语义正确：撤回 = 评审需求被清除，与 `undoCompletion` 同语义） |

#### 8.6.7 清洁状态与最终基线

| 项 | 结果 |
| --- | --- |
| `tests/` 临时探针残留 | **0**（`__qa71_tmp*` 计数 0；2 个探针文件共 17 例已删） |
| `src/` 净改动 | **零**（变异测试临时改动已全部还原，md5 校验一致） |
| QA 额外临时日志 | `.qa71_*.txt` 等已全部删除（根目录残留计数 0） |
| 变异还原后复跑 | **40 套件 / 771 用例全绿**，`EXIT=0` |
| **最终基线** | `npx tsc --noEmit` **exit 0** + **40 套件 / 771 用例全绿**（7.1 后新基线） |

### 8.7 7.1 验收证据（本机实跑）

```
$ npx tsc --noEmit
TSC_EXIT=0                       # 零错误

$ npx jest --config jest.config.js
Test Suites: 40 passed, 40 total
Tests:       771 passed, 771 total
Snapshots:   0 total
Time:        77.691 s
```

**关键落点自检（7.1 硬约束）**：

| # | 落点 | 证据 |
| --- | --- | --- |
| 1 | `closeOpenReviewSubtasks` 定义位置 | `task.service.ts:1415`（**文件末尾**、`ensureReviewSubtask` 之后；未置于 `withdrawCompletion`↔`reviewSubmission` 之间，亦未置于 `applyClearedReviewState`↔`/** 我的待办 */` 之间） |
| 2 | 4 处调用点 | `:369`（moveTask）/ `:475`（reopenTask）/ `:529`（undoCompletion，绑 `if (reviewReset)`）/ `:1105`（withdrawCompletion） |
| 3 | `submissionStatus = ` 全文件计数 | 恰 **7 处**（`:416 / :521 / :955 / :1032 / :1103 / :1157 / :1193`），7.1 **未新增**赋值 |
| 4 | 4 处源码切片禁串 | `withdrawCompletion` 体不含 `'cancelled'` / `pushNotification` / `db.notifications` / `reviewRequired: false` / `reviewerIds: []` / `reviewNote: null`；`undoCompletion` 体不含 `pushNotification` / `db.notifications` |
| 5 | C / E 落点 | `task.service.ts:1346`（C）/ `utils/audit.ts:121`（E） |
| 6 | 未触碰（硬约束） | `TASK_TRANSITIONS` / `BOARD_COLUMNS` / `createClearedReviewState` 6 字段 / `shouldClearReviewOnLeaveDone` 判据行；`reviewSubmission` reject 分支**未**加审核态清理 |
| 7 | 零新依赖 / 样式约束 | `package.json` 零改动；无 `reanimated` / `gesture-handler`；样式取 `src/theme/tokens.ts`；裸 `<Pressable>` 白名单仍 6 文件 |
| 8 | 测试残留 | `tests/` 下无 `__qa_tmp_probe*` 等临时探针残留；仓库根无临时输出文件 |

### 8.8 收尾决议（2026-09-29 用户裁定）

交付收尾阶段 team-lead 做了三项核对（文档一致性 / 仓库卫生 / 图表新鲜度），就其中两项向用户提请裁定，结果如下：

| # | 事项 | 用户裁定 | 后续动作 |
| --- | --- | --- | --- |
| 1 | `tests/increment4-qa.test.ts:358` / `:374` 过滤收窄**超出原授权范围** | **✅ 接受收窄，保留孤儿修复** | R1 由「🔴 授权范围外、待确认」转为「✅ 已追认」；**孤儿修复（A / Route 2）保留**；交付**无未决授权事项**（详见 §8.3 决议记录） |
| 2 | `class-diagram.mermaid` / `sequence-diagram.mermaid` **未覆盖 7.1**（对 `closeOpenReviewSubtasks` / `cancelled` 表达缺失；两图时间戳均早于 7.1 落地） | **✅ 让架构师刷新两张图** | **已完成**。class 图（**4601 B**）：新增 `closeOpenReviewSubtasks` 成员 + 5 条 note（helper 语义 / 4 处调用点 / C / E / 可达链前置）；sequence 图（**8861 B**）：块①复用过滤改 `status 非 done/cancelled`、块②补 E、**新增块③**（孤儿消除 Route 2 + `undoCompletion` 双语义 `alt` + C/E 可达链）。**纯文档改动，未触碰 `src/**` 与 `tests/**`**，本节验收基线不受影响 |

> **核对项 3 的结论（无需用户裁定）**：仓库卫生 ✅ 干净（`*.bak` / `*.orig` / `__qa*` / `.qa*` / `*__verify*` / `*.tmp` 在排除 `node_modules` 后命中为空）；文档一致性 ✅（§8.6.1 变异表与 QA 报告逐条对齐）。
>
> **QA 4 项非阻塞存疑**（见 §8.6.6）已按 QA 建议**接受现状**归档，用户无异议即视为关闭。
>
> **架构图刷新已验收，不影响本节验收结论**：team-lead 独立复跑 `mermaid@11 + jsdom` 解析器 → **图块 4/4 通过**（class 1/1、sequence 3/3）；`find src tests -newermt 22:00` **命中为空** ⇒ `src/**` 与 `tests/**` 未被触碰，`tsc --noEmit` 零错误 + 40 套件 / 771 用例全绿的基线**完好**。
>
> **顺带修复一处既有缺陷**：原 `sequence-diagram.mermaid` 的消息文本含 ASCII `;`，导致**该文件原本即无法通过 mermaid 解析**（已用对照实验反证：含 `;` 的 `sequenceDiagram` 报 `Parse error on line 2`）；本次改全角 `；` 后 3/3 通过。遗留同类问题：`sequence-diagram-increment-5.mermaid:19`（**不属本次范围**，建议后续一并修）。
>
> **team-lead 拦下的一处精度问题**：架构师初版把 **4 处**调用点画成共同经过 `applyClearedReviewState`，但 `undoCompletion:515-516` 走 `Object.assign(task, reviewReset)`、**不经该 helper**（4 处中仅 3 处经 `applyClearedReviewState`）⇒ 已要求拆为两条消息明确区分并重跑解析（改后仍 4/4 通过）。
