# 增量 PRD（增量 4）— OpenSchedule 移动端：提报 / 审核状态机收口

> 本文件为**增量 PRD**，只描述增量 4 的变更。增量 1（`M2-*`）/ 增量 2（`M3-*`）/ 增量 3（`M4-*`）已交付内容不在此重述。
> 编号前缀：`M5-`。
> **本增量不含竞品 / 市场分析**（简单 PRD 档位）。

---

## 1. 项目信息

| 项 | 值 |
| --- | --- |
| Language | 中文（与用户需求一致） |
| Programming Language | TypeScript 6 + Expo 57 / RN 0.86.3 / React 19（沿用 `apps/mobile` 既有工程，**不新增依赖**） |
| Project Name | `openschedule_mobile_increment_4` |
| 落盘位置 | `apps/mobile/src/`（源码）、`apps/mobile/tests/`（测试）、`docs/mobile-app/`（文档） |
| 包管理器 | `npm` / `npx`（**禁 `pnpm`**） |
| 依赖约束 | **零新增依赖**；禁 `react-native-reanimated` / `react-native-gesture-handler` |

### 1.1 原始需求复述

> 增量 4 收口「提报 / 审核状态机」的三件同源遗留事项（增量 3 交付说明 §7-1/2/3）：
> ① **列表内容互斥**（原 Q4-12）：「今日到期」与「临期预警」列表内容重叠，是否收口；
> ② **非 `done` 的既存 `pending` 缺口收口**（原 N2）：`in_progress` + `submissionStatus='pending'`（种子 `task-014` / `task-015`）离开当前状态时不清理审核态，该态是否合法；
> ③ **「完成提报」撤回入口**（原 N1）：`withdrawSubmission` 对正式任务语义错误，导致「完成提报」缺少正确的撤回路径。

### 1.2 本增量的一句话结论（先读这条）

**三件事经实读复核后，只有 ③ 需要写代码；① 与 ② 均裁定「不做」，但必须把口径与定义落到文档与注释上并加口径锚点。**

| 事项 | 裁定 | 落地形态 |
| --- | --- | --- |
| ① 列表内容互斥 | **不做**（Q4-12 就此闭合） | 文档 + 注释登记口径；新增「徽标 ≠ 头部」口径锚点 |
| ② 非 `done` 的 `pending` | **合法态，不做收口** | 显式定义「**审核轮回态**」；零行为变更 |
| ③ 完成提报撤回入口 | **做** | 新增 `withdrawCompletion` + 详情页入口 + 主体判定修正 |

> ⚠️ 因此本增量的**代码交付集中在 ③**。①/② 的产出是「裁定 + 定义 + 回归锚点」，不是代码。**这是有意为之，不是缩水**：①/② 若动手，均会造成**语义退化或触碰受保护断言**（证据见 §3，裁定见 §8，残留风险见 §9）。

---

## 2. 背景与范围

### 2.1 范围（三件事）

| # | 事项 | 原编号 | 来源 |
| --- | --- | --- | --- |
| ① | 「今日到期」与「临期预警」列表内容是否互斥 | Q4-12 | `PRD-mobile-increment-3.md` §7.2 / §8-3 |
| ② | 非 `done` 的既存 `pending`（`in_progress` + `pending`）是否收口 | N2 | `DELIVERY-mobile-increment-3.md` §7-2 / `PRD-3` §8-9 |
| ③ | 「完成提报」撤回入口 | N1 | `DELIVERY-mobile-increment-3.md` §7-3 / `PRD-3` §8-11 |

### 2.2 显式「不做」清单（范围铁律）

以下**一律不做**，命中即视为超范围：

1. **不做** ① 的列表内容互斥（含「临期预警排除今日到期」等任何方向）。
2. **不做** ② 的行为收口（**禁止**修改 `shouldClearReviewOnLeaveDone` 的判据、**禁止**给 `moveTask` / `reopenTask` 增加新的清理分支）。
3. **禁止**改动 `undoCompletion` / `withdrawSubmission` / `moveTask` / `reopenTask` / `reviewSubmission` / `completeTask` 的**既有行为**（仅允许新增独立函数）。
4. **禁止**修改任何**既有测试断言**（含 `tests/submission-flow.test.ts:76`、`tests/increment2-completion.test.ts:96-100/207-218`、`tests/increment2-qa.test.ts:107-117`、`tests/increment3-qa.test.ts:79/306-316`）。
5. **禁止**改动**通知系统**：不新增通知类型、不改 `pushNotification` / `pushNotificationOnce`、撤回动作**零通知**（与 `undoCompletion` 零通知口径一致）。
6. **禁止**修改 `SUBMISSION_TRANSITIONS` 表内容（会被 `tests/submission-flow.test.ts:76` 锁定）。
7. **禁止**新增 `PermissionAction` key（复用既有 `submission:withdraw`）。
8. **禁止**改动种子数据 `src/data/seed.ts`（含 `task-014` / `task-015`；改种子会级联触碰 6+ 个既有断言）。
9. **禁止**重构、禁止顺手清理 `dist-v4/v5/v6`、禁止改 `tsconfig.json` / `jest.config.js`。
10. **禁止**新增依赖、禁止 `pnpm`。

### 2.3 产品目标

1. **让「提报人」能正确地撤回自己的完成提报**：撤回后任务回到「推进中」，且**绝不会**被写成 `cancelled`。
2. **把两个「悬而未决」的状态机口径变成显式契约**：① 的三分组口径、② 的审核轮回态，各自有唯一书面定义 + 回归锚点，后续增量不得凭直觉改动。
3. **零回归**：既有 33 个测试文件断言全绿，行为变更面**仅限新增的撤回入口**。

### 2.4 用户故事

| # | 故事 |
| --- | --- |
| US5-01 | As a **任务负责人（提报人）**, I want 撤回我刚提交的完成提报, so that 任务回到「进行中」继续推进，而不会被误判为已完成 / 被取消。 |
| US5-02 | As a **任务负责人**, I want 在任务详情页看到「撤回提报」入口（仅在我本人提报且仍在待审时出现）, so that 我不必依赖几秒内就消失的撤销 Toast。 |
| US5-03 | As a **审核人**, I want 被撤回的提报立即从「待我审核」消失, so that 我不会去审核一个已经被撤回的提报。 |
| US5-04 | As a **产品 / 研发**, I want 「今日到期 / 临期预警 / 待我审核」三组重叠是**被书面承认的口径**, so that 后续不会被当成缺陷反复返工。 |
| US5-05 | As a **产品 / 研发**, I want 「非 `done` + `pending`」被书面定义为合法的**审核轮回态**, so that 它的「离开不清理」行为不会被误判为漏改。 |

### 2.5 术语表（本增量新增 / 修订）

| 术语 | 定义 | 证据 |
| --- | --- | --- |
| **完成提报** | `status='done'` **且** `submissionStatus='pending'`。由 `completeTask` 原子写入（`task.service.ts:340-349`）。`completedAt != null`。 | `task.service.ts:332-373` |
| **审核轮回态**（本增量**新增定义**） | **非 `done`** 且 `submissionStatus='pending'`，且 `reviewRequired=true` / `reviewerIds` 非空。语义 = 「完成提报曾被通过，随后被『撤销审核通过』⇒ 任务回到推进中，同时提报重新回到待审队列等待再审」。`completedAt === null`。 | `TodayFocusScreen.tsx:247-257` + `submission.ts:145-148` + `tests/increment2-qa.test.ts:177-199` |
| **提报人**（本增量**修订**） | 分叉口径：`resolveApproveBranch(task) === 'completion'` ⇒ 提报人 = `assigneeId`；否则 ⇒ `createdBy`。 | `submission.ts:191` vs `submission.ts:200` |
| **三分组口径**（本增量**登记**） | 徽标 = 该分组**长度**（`TodayFocusScreen.tsx:108-115`）；头部 N = 三分组按 `task.id` **并集基数**（`utils/focus.ts:29-41`）。二者**允许不等**。 | 同左 |

---

## 3. 现状与差距（行号级证据）

> 本节的每一条均已**实读源码 + 实测运行**复核。凡与主理人转述不符者，在 §3.6 显式纠正。

### 3.1 ① 三分组重叠：现状与实测

**取数实现（三处，互不知情）**

| 分组 | 实现 | 过滤条件 |
| --- | --- | --- |
| 今日到期 | `task.service.ts:168-186` | `dueAt` 的**日历日** = 今天（`:171-175`）∧ `status ∉ {done, cancelled}`（`:176-177`）∧ `submissionStatus !== 'pending'`（`:178`）∧ `!isSubmissionRecord`（`:180`） |
| 待我审核 | `task.service.ts:189-202` | `reviewRequired === true` ∧ `submissionStatus === 'pending'` ∧ `reviewerIds ∋ me`（`:194-196`）。**不看 `status`，不排除提报记录** |
| 临期预警 | `task.service.ts:205-222` | `dueAt ∈ [now−1h, now+24h]`（`:208-215`）∧ `status ∉ {done, cancelled}`（`:212`）∧ `!isSubmissionRecord`（`:213`）。**不排除 `pending`** |

**聚合层原样返回**：`focus.service.ts:71-76` 三组 `Promise.all` 后**原样返回**，不做任何去重。

**头部汇总已修正**：`TodayFocusScreen.tsx:141` 调 `countVisibleFocusTasks`（`utils/focus.ts:29-41`，按 `task.id` 取并集）⇒ 头部 N 正确。
**徽标未变**：`TodayFocusScreen.tsx:108-115` 的 `counts` = 各分组**原始长度**，`:124` 注入徽标 ⇒ 徽标之和 > 头部 N。

**实测（本次，`2026-09-27T13:46Z` = 北京时间 21:46）**

```
dueToday      = [task-005, task-004, task-016, task-001, task-017]   // 5
pendingReview = [task-014, task-015, task-019, task-020]             // 4
approaching   = [task-005, task-017, task-018]                       // 3
due ∩ appr    = [task-005, task-017]                                 // 2
review ∩ appr = []                                                   // 0
due ∩ review  = []                                                   // 0
徽标之和 = 12  头部并集 = 10
```

**差距结论**

- **D1（口径差异，非缺陷）**：徽标之和（12）≠ 头部（10）。这是 K13 已登记的**两套口径**，不是错误数字；用户可见的「共 N 项待处理」已正确。
- **D2（重叠是定义使然，且**不是**包含关系）**：`dueToday` 与 `approaching` 是**交叉重叠**，不是包含：
  - `task-016`（`seed.ts:486/489`，`todo` + 今日 16:00）在 `dueToday` 内、但 21:46 已跌出 24h 窗口 ⇒ 在 `approaching` **外**；
  - `task-018`（`seed.ts:520/523`，`todo` + 次日 12:00）在 `approaching` 内、但不在 `dueToday`。
  - 二者唯一**结构性**非空重叠：`task-005`（`seed.ts:276/279`，今日 22:00）在运行时刻 ∈ `[00:00, 23:00]` 时恒同时落在两组。
- **D3（重叠数随时刻漂移）**：`approaching` 是 24h 滑动窗口 ⇒ 重叠条数随时钟变化（增量 3 观测「3 条」≈ 19:00–20:00 快照；本次 21:46 观测「2 条」）。**任何以固定条数写死的 AC 都会漂移**。
- **D4（① 与 ② 的耦合点，本次新发现）**：`review ∩ appr` 的重叠**只可能**来自「非 `done` 的 `pending`」任务——因为 `listDeadlineApproaching` 已排除 `done`（`:212`），而**正常的完成提报**（`done + pending`）必然被排除。种子中 `review ∩ appr` 的**全部**候选就是 `task-014` / `task-015`（审核轮回态）。⇒ **① 中「待我审核 ∩ 临期预警」这一对的重叠是 ② 的派生物**；② 若被判定为脏数据并修复，这一对重叠会自动消失。反之 ② 既判为合法，则该重叠**应当保留**。

### 3.2 ② 非 `done` 的 `pending`：现状

**判据实现**（`submission.ts:160-165`）

```ts
return task.status === 'done' && nextStatus !== 'done' && task.submissionStatus === 'pending'
```

三条件（`:153-156` 注释）：① 当前 `done`；② 目标非 `done`；③ 仍 `pending`。

**调用点**：`task.service.ts:304`（`moveTask`，须在改写 `status` **之前**求值）与 `:385`（`reopenTask`，目标恒 `todo`）。二者共用唯一清理字段包构造点 `createClearedReviewState()`（`submission.ts:126-135`，落地于 `task.service.ts:144-146`）。

**种子事实（实读 + 实测）**

| 任务 | `status` | `submissionStatus` | `source` | `submissionKind` | `assigneeId` | `createdBy` | `reviewerIds` | `isSubmissionRecord` | `resolveApproveBranch` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `task-014` | `in_progress`（`seed.ts:439`） | `pending`（`:451`） | `submission`（`:450`） | **`undefined`**（`makeTask` 无该默认值，`seed.ts:165-193`） | `user-002`（`:441`） | `user-001`（`:183` 默认） | `['user-001']`（`:454`） | **`false`** | **`completion`** |
| `task-015` | `in_progress`（`seed.ts:463`） | `pending`（`:473`） | `submission`（`:472`） | `undefined` | `user-003`（`:465`） | `user-001` | `['user-001']`（`:476`） | **`false`** | **`completion`** |

**实测（本次运行）**

```
task-014  status=in_progress  submissionStatus=pending  submissionKind=undefined
          source=submission  reviewRequired=true  reviewerIds=["user-001"]
          isSubmissionRecord=false  branch=completion
          shouldClearReviewOnLeaveDone(task-014,'todo')    = false
          shouldClearReviewOnLeaveDone(task-014,'blocked') = false
```

⇒ 与主理人转述**一致**：`task-014` / `task-015` 确为 `in_progress` + `pending`，且经 `moveTask` 离开当前状态时**不清理**审核态。

**关键反证：该组合是**产品自己产生并刻意保留**的合法态**

| 证据 | 位置 | 说明 |
| --- | --- | --- |
| E1 | `TodayFocusScreen.tsx:247-257` | 撤销「审核通过」时显式传 `{ status: 'in_progress', submissionStatus: 'pending' }` ⇒ **产品自己写出 `in_progress + pending`** |
| E2 | `submission.ts:145-148`（`resolveUndoReviewReset`） | 仅当 `next === null` 才清理；传 `'pending'` **返回 `null`（不清理）** ⇒ 刻意**保留** `reviewRequired` / `reviewerIds` |
| E3 | `submission.ts:137-144` 注释（K3） | 「`'pending'`（撤销审核通过）**不得**复位 `reviewRequired` / `reviewerIds`，否则任务会从待审队列消失」 |
| E4 | `tests/increment2-qa.test.ts:177-199`、`tests/increment2-completion.test.ts:351-371`、`tests/round2-regression.test.ts:43-57` | 三处断言「撤销审核通过后任务**仍在** `listPendingReview`」，注释写明「反向缺陷会在此失败」 |
| E5 | `tests/increment2-completion.test.ts:96-100` | 直接断言 `shouldClearReviewOnLeaveDone({status:'in_progress',submissionStatus:'pending'}, 'todo') === false` |
| E6 | `tests/increment2-qa.test.ts:107-117` | 断言 `moveTask('task-014', {status:'todo'})` 后 `submissionStatus` 仍为 `'pending'` |

⇒ **`in_progress + pending` 是产品在「撤销审核通过」流程中主动写入、并被 4 个测试套件保护的状态**。它不是脏数据。

### 3.3 ③ 完成提报撤回：现状与缺陷

**既有 `withdrawSubmission`（`task.service.ts:903-928`）**

| 行 | 行为 | 问题 |
| --- | --- | --- |
| `:913-915` | 校验 `task.createdBy !== actorId` ⇒ 40302 | **主体错位**：完成提报的提报人是 `assigneeId`（`submission.ts:191`），不是 `createdBy` |
| `:916-918` | 校验 `submissionStatus !== 'pending'` ⇒ 40302 | 正确（与 `submission.ts:90-95` 一致） |
| `:919-920` | `submissionStatus='withdrawn'` + **`status='cancelled'`** | **语义错误**：`cancelled` 是「提报记录归档」语义（对比 `landSubmissionRecord` `:853`）；对**正式任务**写成 `cancelled` 等于把任务取消 |
| `:923` | `pushAudit('submission.withdraw', …)` | 可复用 |
| `:926-927` | `// TODO(real-api)` | 需同步 |

**唯一调用点**：`MySubmissionsScreen.tsx:98`；该页数据源 `listMySubmissions`（`task.service.ts:890-900`）**过滤 `isSubmissionRecord`**（`:894`）⇒ 种子 `task-014` / `task-015`（`isSubmissionRecord === false`）**根本不在「我的提报」列表里** ⇒ 目前**没有任何 UI 路径**能为完成提报发起撤回。缺陷当前是**潜伏**的。

**权限谓词是死代码**：`isWithdrawable`（`submission.ts:90-95`，文档注释写「仅本人 + `pending`」）**全仓零引用**（`src/` 与 `tests/` 均只有定义处）。服务层 `:913` 内联了**另一套**判据（`createdBy`）⇒ **谓词与实现已经漂移**，这正是 `:913` 主体错位的根因。

**权限 key 已存在**：`permission.ts:29` `'submission:withdraw': ['manager','member']`，注释「仅本人 `pending` 可撤回」⇒ **无需新增 key**（`:33` 另有两条「预留、不得用于门禁」的说明，本增量不得触碰）。

**「唯一退出路径是撤销完成」——不准确（实读纠正）**

`TaskDetailScreen.tsx:116` 用 `TASK_TRANSITION_ACTIONS[status]`；`done` 的两项动作（`types/task.ts:142-145`：「重开为待办」/「重开为进行中」，均 `requireReason`）在 `runTransition` 中**都走 `reopenTask`**（`TaskDetailScreen.tsx:129-133`），而 `reopenTask` 的目标**恒为 `todo`**（`task.service.ts:382`）。

⇒ 事实是：完成提报后**至少有两条**退出路径——① 今日聚焦 Toast 内的 `undoCompletion`（`TodayFocusScreen.tsx:254`，仅数秒窗口）；② 详情页「重开为待办 / **重开为进行中**」→ `reopenTask` → 落 `todo` 并清理审核态（`:385/:390`）。
⇒ 同时暴露一个**新缺陷（本次登记，不修）**：详情页「**重开为进行中**」的标签与行为不符（实际落到 `todo`）。见 §8-3。

### 3.4 ③ 的迁移表约束（实读）

`SUBMISSION_TRANSITIONS`（**定义在 `submission.ts:19-25`，不在 `types/task.ts`**）：

```
draft     → pending | published
pending   → approved | rejected | withdrawn      ← 撤回的合法目标
approved  → []                                    ← 终态
rejected  → draft
withdrawn → draft
```

- `pending → withdrawn` **已在表内** ⇒ 撤回在提报状态机上是合法迁移。
- `canTransition`（`submission.ts:83-87`）**全仓无调用**（`src/` 与 `tests/` 仅 `tests/submission-flow.test.ts` 直接断言该纯函数）⇒ **该表当前是「只读文档」，不构成运行时守卫**。
- 表与真实行为**已冲突**：`approved → pending`（`undoCompletion` 撤销审核通过，`TodayFocusScreen.tsx:257`）表内**不允许**，但产品在跑；`rejected → pending`（驳回后重新完成提报，`tests/increment2-completion.test.ts:298-305`）表内**不允许**，但产品在跑。
- **本次不得改表**：`tests/submission-flow.test.ts:76` 断言 `canTransition('approved','pending') === false`（受保护断言）。⇒ 登记为 §8-2，建议**下一增量**与「表成为真守卫」一并收口。

### 3.5 ③ 的状态回退约束（实读）

`TASK_TRANSITIONS`（`types/task.ts:106-112`）：

```
todo        → in_progress | blocked | cancelled      // 无 done（todo→done 非法，40902）
in_progress → todo | done | blocked | cancelled
blocked     → in_progress | done | cancelled
done        → todo | in_progress                      // blocked 不可达
cancelled   → []
```

⇒ ①「完成提报」可能来自 `in_progress` **或** `blocked`（`in_progress→done`、`blocked→done` 均合法）；② `done` 只能回 `todo` / `in_progress`，**无法回到 `blocked`**。
⇒ 既有 UI 已按此归一：`TodayFocusScreen.tsx:247-252` 对 `prevStatus === 'blocked'` **降级为 `in_progress`**。
⇒ **撤回目标状态只能是 `in_progress`**（详见 §7 R5-5）。

### 3.6 对主理人转述的实读纠正（3 条）

| # | 转述 | 实读结论 | 证据 |
| --- | --- | --- | --- |
| **C1** | 「② 请结合 `types/task.ts` 的 `TASK_TRANSITIONS` / `SUBMISSION_TRANSITIONS`」 | `SUBMISSION_TRANSITIONS` **不在 `types/task.ts`**，而在 `src/utils/submission.ts:19-25`；`types/task.ts` 只有 `TASK_TRANSITIONS`（`:106-112`）与 `REASON_MIN_LENGTH`（`:150`）。且 `SUBMISSION_TRANSITIONS` / `canTransition` **全仓无运行时调用**（死表） | `submission.ts:19-25`、`types/task.ts:106-112`、全仓 grep |
| **C2** | 「① 二者定义上是**包含关系**」 | **不成立**，是**交叉重叠**：`task-016` ∈ `dueToday \ approaching`，`task-018` ∈ `approaching \ dueToday`（实测）。且 `dueToday` 额外排除 `pending`（`task.service.ts:178`）⇒ 更不可能构成包含 | §3.1 实测输出；`seed.ts:486/489`、`seed.ts:520/523` |
| **C3** | 「③ 目前「完成提报」后**唯一**的退出路径是「撤销完成」」 | 至少有**两条**：① `undoCompletion`（`TodayFocusScreen.tsx:254`，仅 Toast 数秒窗口）；② 详情页 `TASK_TRANSITION_ACTIONS.done` 两项动作 → **均**走 `reopenTask`（`TaskDetailScreen.tsx:129-133`）→ 落 `todo` 并清理审核态。附带暴露新缺陷：「重开为进行中」标签与实际行为（落 `todo`）不符 | `types/task.ts:142-145`、`TaskDetailScreen.tsx:116/129-133`、`task.service.ts:382/385/390` |

---

## 4. 需求池

> 优先级：**P0 = Must have**（本增量必须交付）｜**P1 = Should have**｜**P2 = Nice to have / 登记项**。

### P0

| 编号 | 需求 | 说明 | 依赖 |
| --- | --- | --- | --- |
| **M5-P0-01** | 新增 `withdrawCompletion(taskId, version, actorId)` 服务入口（**新增独立函数**） | ① 主体判定：`resolveApproveBranch === 'completion'` ⇒ 提报人 = `task.assigneeId ?? task.createdBy`；非本人 ⇒ **40302**。② 前置：`submissionStatus === 'pending'`，否则 **40302**。③ `assertVersion`（**40901**）。④ 置 `submissionStatus='withdrawn'`。⑤ 清理审核态：**必须复用 `createClearedReviewState()`**（`submission.ts:126-135`）再覆写 `submissionStatus='withdrawn'`（**禁止**在 service 内手写第二份字段清单）。⑥ `status`：当前为 `done` ⇒ 置 `in_progress`（先 `assertTransition('done','in_progress')`，并 `completedAt=null`）；当前**非** `done` ⇒ **不改 `status`**（避免非法自迁移 40902）。⑦ `version += 1`、`updatedAt=now()`。⑧ **零通知**。 | 无 |
| **M5-P0-02** | 撤回主体判定收敛为**单一事实来源** | 修正 `isWithdrawable`（`submission.ts:90-95`）为分叉主体：`completion` ⇒ `assigneeId ?? createdBy`；否则 ⇒ `createdBy`；**并在 `withdrawCompletion` 内真正引用该纯函数**（消除死代码与「谓词/实现漂移」）。`withdrawSubmission` 的既有内联判据**不动**（避免触碰 `submission-flow.test.ts:240-263`） | M5-P0-01 |
| **M5-P0-03** | 任务详情页「撤回提报」入口 | 仅当 `submissionStatus === 'pending'` ∧ `can('submission:withdraw')` ∧ 当前用户 === 提报人（用 M5-P0-02 的谓词）时渲染；**隐藏而非置灰**（`permission.ts:8` 约定）。二次确认 `BottomSheet`（照 `MySubmissionsScreen.tsx:179-190` 姿势）+ 成功轻提示 + 失败中文提示（`getErrorMessage`）+ 成功后 `detail.refetch()`。**不得**把该动作塞进 `TASK_TRANSITION_ACTIONS`（不得混淆任务状态机与提报状态机） | M5-P0-01/02 |
| **M5-P0-04** | ① 裁定落地：三分组口径登记 | 在 `utils/focus.ts:29-41` 与 `TodayFocusScreen.tsx:108-115` 附近**补注释**：徽标 = 分组长度、头部 = 并集基数、**允许不等**、**不得**为相等而改变任一分组内容。**零行为变更** | 无 |
| **M5-P0-05** | ② 裁定落地：「审核轮回态」显式定义 | 在 `submission.ts:160-165` 附近**补注释**：`shouldClearReviewOnLeaveDone` 的窄口径是**有意为之**——`done → 非 done` 表示「撤回完成声明」故清理；**非 `done` 的 `pending`（审核轮回态）离开不清理**，因为该态下任务仍在推进、审核人必须仍能看到它（K3）。**零行为变更** | 无 |

### P1

| 编号 | 需求 | 说明 |
| --- | --- | --- |
| **M5-P1-01** | 撤回写团队动态 | `pushAudit('submission.withdraw.completion', actorId, taskId, '撤回了「{title}」的完成提报')`（照 `task.service.ts:112-124` 姿势）。**不新增通知** |
| **M5-P1-02** | 撤回原因**可选** | 入参 `reason?: string`，≤200 字；**不强制 ≥4 字**（与 `undoCompletion.reason?` / `withdrawSubmission` 既有约定一致，不新增必填校验面）。填写时并入 audit summary |
| **M5-P1-03** | 撤回后「待我审核」即时收敛 | 详情页撤回成功后 `refetch`；若从「今日聚焦」进入，返回时列表须已不含该任务（断言 `listPendingReview` 不再包含） |

### P2（登记项，本次不实现）

| 编号 | 需求 | 说明 |
| --- | --- | --- |
| **M5-P2-01** | `SUBMISSION_TRANSITIONS` 收口为真守卫 | 现状：死表 + 与真实行为冲突（缺 `approved → pending`、`rejected → pending`）+ 被 `submission-flow.test.ts:76` 锁定。建议下一增量：修表 → 让 `canTransition` 成为 `submissionStatus` 写入的唯一守卫 → 同步改该受保护断言 |
| **M5-P2-02** | 详情页「重开为进行中」标签与行为不符 | 实读证据 §3.3；建议下一增量让 `done → in_progress` 走 `moveTask`（`moveTask` 亦会清理审核态，行为正确） |
| **M5-P2-03** | `listTodayDue` 排除 `pending` 与审核轮回态语义冲突 | K15 遗留（`task.service.ts:178` vs `:210-216`）：审核轮回态任务仍在推进却从「今日到期」消失。建议下一增量重审 Q4-4 |
| **M5-P2-04** | `withdrawSubmission` 对正式任务加守卫 | 建议加 `if (!isSubmissionRecord(task)) throw 40302`，防止未来误接线把正式任务写成 `cancelled` |

---

## 5. AC（验收标准）

> ⚠️ **Given 中的种子任务 `status` 均已实读确认迁移合法**（§3.2 / §3.5）。凡涉及 `done → 非 done` 的用例，均**先用 `completeTask` 造出 `done + pending`**，且所用任务当前状态 ∈ `{in_progress, blocked}`。
> ⚠️ **禁止**对 `todo` 任务直接 `completeTask`（`todo → done` 非法，`TASK_TRANSITIONS.todo` 不含 `'done'`，`task.service.ts:338` 抛 **40902**）。历史教训：`PRD-mobile-increment-3.md` v1.1 修订记录 ①。

### 5.1 ③ 撤回入口（本增量唯一行为变更）

| # | Given | When | Then |
| --- | --- | --- | --- |
| **AC-01** | 种子 `task-014`：`status='in_progress'`、`submissionStatus='pending'`、`assigneeId=user-002`、`reviewerIds=['user-001']`（`seed.ts:439/451/441/454`，已实读） | `withdrawCompletion('task-014', v, 'user-002')` | `submissionStatus === 'withdrawn'`；`status === 'in_progress'`（**不得**变 `cancelled`）；`reviewRequired === false`；`reviewerIds` 为空数组；`version === v+1`；且 `listPendingReview('user-001')` **不含** `task-014` |
| **AC-02** | 同 AC-01 的 `task-014` | `withdrawCompletion('task-014', v, 'user-001')`（`user-001` 是 `createdBy` 但**不是**提报人） | 抛 `ApiError`，`code === 40302`（`ERR_SUBMISSION_FORBIDDEN`）；任务**未被修改**（`submissionStatus` 仍 `'pending'`、`version` 不变） |
| **AC-03** | `task-004`：`status='in_progress'`、`assigneeId=user-002`（`seed.ts:257/259`，已实读）。先 `completeTask('task-004', { version })` ⇒ `status='done'` + `submissionStatus='pending'`（`in_progress → done` 合法） | `withdrawCompletion('task-004', v2, 'user-002')` | `status === 'in_progress'`；`completedAt === null`；`submissionStatus === 'withdrawn'`；`reviewRequired === false`；`reviewerIds.length === 0`；`listPendingReview` 不含 `task-004` |
| **AC-04** | 同 AC-03 的 `task-004`（已 `done + pending`） | `withdrawCompletion('task-004', v - 1, 'user-002')`（**陈旧 version**） | 抛 `ApiError`，`code === 40901`（`ERR_OPTIMISTIC_LOCK`）；任务状态不变 |
| **AC-05** | `task-014` 已按 AC-01 撤回（`submissionStatus='withdrawn'`） | 再次 `withdrawCompletion('task-014', v3, 'user-002')` | 抛 `code === 40302`（**幂等拒绝**，非 500）；`submissionStatus` 仍 `'withdrawn'` |
| **AC-06** | `task-014`（`in_progress + pending`） | ① `reviewSubmission('task-014','approve', v)` ⇒ `submissionStatus='approved'`、`status='done'`；② `withdrawCompletion('task-014', v2, 'user-002')` | 步骤② 抛 `code === 40302`；`submissionStatus` 仍 `'approved'`、`status` 仍 `'done'`（**审核通过后不可撤回**） |
| **AC-07** | `task-015`（`in_progress + pending`，`assigneeId=user-003`，`seed.ts:463/473/465`） | ① `reviewSubmission('task-015','reject', v, '说明不充分')` ⇒ `submissionStatus='rejected'`；② `withdrawCompletion('task-015', v2, 'user-003')` | 步骤② 抛 `code === 40302`（**驳回后不可撤回**）；`submissionStatus` 仍 `'rejected'` |
| **AC-08** | `task-007`（`status='done'`，`submissionStatus === undefined`，`seed.ts:314`，已实读） | `withdrawCompletion('task-007', v, 'user-001')` | 抛 `code === 40302`（**非 `pending` 不可撤回**）；任务零变化 |
| **AC-09** | `task-004` 已 `completeTask` 成 `done + pending`；记录 `db.notifications` 的 JSON 快照与 `db.auditFeed.length` | `withdrawCompletion('task-004', v, 'user-002')` | `JSON.stringify(db.notifications)` **与快照逐字节相等**（**零通知**）；`db.auditFeed.length` **+1** 且 `db.auditFeed[0].action === 'submission.withdraw.completion'`、`summary` 含任务标题 |
| **AC-10** | 任意上述撤回成功的任务 | 撤回后检查 | `status !== 'cancelled'`（**正式任务永不被撤回动作写成 `cancelled`**）；`task-014` / `task-015`（撤回前即非 `done`）的 `status` **保持撤回前原值**（不改状态） |
| **AC-11** | `task-004` 已 `completeTask` ⇒ `done + pending`，`dueAt` 为今日 20:00（`seed.ts:260`） | 撤回前调 `listTodayDue(me, 'Asia/Shanghai')` 得 `before`；撤回后重取得 `after` | 撤回前 `before` **不含** `task-004`（因 `submissionStatus === 'pending'` 被 `task.service.ts:178` 排除）；撤回后 `after` **含** `task-004`（`withdrawn ≠ pending` ⇒ 重新可见）。**证明撤回让任务重新可执行** |
| **AC-12** | 全仓源码 | `npx tsc --noEmit`；`npx jest --config jest.config.js` | `tsc` **0 error**；**31 个测试套件 / 502 个用例全部通过**（基线实测值），**零新增失败**（`submission-flow` / `increment2-*` / `increment3-*` / `round2-regression` 断言**一字未改**） |

### 5.2 ① / ② 的裁定锚点（零行为变更）

| # | Given | When | Then |
| --- | --- | --- | --- |
| **AC-13** | 本增量交付后源码 | 全量 `npx jest --config jest.config.js` | `tests/increment2-completion.test.ts:96-100`、`tests/increment2-qa.test.ts:107-117`、`tests/increment3-qa.test.ts:79/306-316`、`tests/submission-flow.test.ts:76` **全部通过且内容未改**（证明 ①/② 未被动过）。基线（本增量开工前实测）：**31 套件 / 502 用例全绿** |
| **AC-14** | 本增量交付后源码 | `grep` `shouldClearReviewOnLeaveDone` 的判据行 | 判据仍为 `task.status === 'done' && nextStatus !== 'done' && task.submissionStatus === 'pending'`（**未新增条件**）；`listTodayDue` / `listDeadlineApproaching` 的过滤条件**逐条不变**（证明 ① 未实现互斥） |

---

## 6. INV（不变量）

| # | 不变量 | 判据 | 来源 |
| --- | --- | --- | --- |
| **INV-1** | `completedAt != null` **⟺** `status === 'done'` | 撤回 `done → in_progress` 时必须同时置 `completedAt = null`（AC-03） | 增量 2 既有 INV-1 |
| **INV-2** | 分组**徽标** = 该分组长度；头部 N = 三分组按 `task.id` **并集基数**；二者**允许不等**（`badgeSum ≥ headerUnion`） | `TodayFocusScreen.tsx:108-115` + `utils/focus.ts:29-41`。**禁止**为「相等」而改变任一分组内容 | ① 裁定（K13） |
| **INV-3** | `submissionStatus === 'pending'` ∧ `reviewRequired === true` ∧ `reviewerIds ∋ me` **⟺** 该任务出现在 `listPendingReview(me)` | 撤回后 `submissionStatus='withdrawn'` ⇒ **必然**从 `listPendingReview` 消失（AC-01） | `task.service.ts:194-196` |
| **INV-4** | 一切写操作携带 `version`（乐观锁）：不匹配 ⇒ **40901**；非法**任务**状态迁移 ⇒ **40902**（`details.allowed_transitions`） | AC-04 / AC-10；`task.service.ts:95-109` | 全局铁律 |
| **INV-5** | 正式任务（`isSubmissionRecord === false`）的 `status` **永不**被撤回动作写成 `'cancelled'` | AC-10 | 本增量核心（修 `task.service.ts:920` 的语义错误） |
| **INV-6** | 撤回动作**零通知**：`db.notifications` 前后**逐字节相等** | AC-09 | 与 `undoCompletion` 零通知口径一致（`tests/increment3-qa.test.ts:329-345`） |
| **INV-7** | **审核轮回态**（非 `done` + `pending`）的 `reviewRequired` / `reviewerIds` **不得被任何迁移清理** | ② 裁定；`submission.ts:137-148`；`tests/increment2-qa.test.ts:177-199` 保护 | ② 裁定 |
| **INV-8** | `submissionStatus` 的合法写入集合不变：`pending → withdrawn` 合法；`approved` 为终态；`withdrawn → draft` 为唯一后继 | `submission.ts:19-25`（**表内容本增量零改动**） | ③ 约束 |

---

## 7. 待确认问题（逐条附**建议裁定**）

> 以下问题本次**均已给出建议裁定并按该裁定实施**（§8 裁定表同步）。若主理人 / 用户有异议，请在施工前回执。

| # | 问题 | 我的建议裁定 | 理由 |
| --- | --- | --- | --- |
| **Q5-1** | 撤回是否通知审核人「该提报已被撤回」？ | **本次不发通知**；登记为 §9-1（下一增量候选） | ① 硬约束「不得动通知系统」；② 与同族动作 `undoCompletion` 的**零通知**口径一致（该口径已被 `tests/increment3-qa.test.ts:329-345` 固化为断言）；③ 撤回后任务回到正式列表，审核人从「待我审核」消失属预期 |
| **Q5-2** | 详情页「重开为进行中」标签与行为不符（实际落 `todo`），本次是否顺手修？ | **不修**；登记为 §9-3 / `M5-P2-02` | ① 属**任务**状态机 UI 缺陷，不在三件事范围；② 修它要动 `TaskDetailScreen.tsx:129-133` 的分支，回归面超出「只做三件事」 |
| **Q5-3** | 撤回入口放「我的提报」页还是「任务详情」页？ | **任务详情页**（`M5-P0-03`） | ① 「我的提报」数据源 `listMySubmissions` **按定义只列提报记录**（`task.service.ts:894`），完成提报 `isSubmissionRecord === false` ⇒ 放那里必须**放宽该守卫**，会触碰 `seed-submissions.test.ts` 与 ARCH §7 列表守卫；② 完成提报的载体是**任务**，入口应与任务同屏；③ 「我的提报」侧维持既有 `withdrawSubmission` **零改动** |
| **Q5-4** | 是否顺带把 `SUBMISSION_TRANSITIONS` 收口为真守卫？ | **本次不做**；登记为 §9-2 / `M5-P2-01` | 表当前与真实行为冲突（缺 `approved → pending`、`rejected → pending`），修表**必然**触碰受保护断言 `tests/submission-flow.test.ts:76` ⇒ 命中「不得改既有测试断言」 |
| **Q5-5** | 审核轮回态任务是否应从「今日到期」恢复可见（即撤销 K15 的「排除待审中」）？ | **本次不动**；登记为 §9-4 / `M5-P2-03` | K15（`task.service.ts:178`）是增量 3 刚闭合的 Q4-4 决策；本次翻转会重开已闭合决策并触碰 `increment3-*` 断言。语义冲突本身值得下一增量重审 |
| **Q5-6** | 撤回原因是否必填（≥4 字）？ | **不必填**（可选，≤200 字） | 与最近的同族先例一致：`UndoCompletionInput.reason?`（`task.service.ts:413`）、`withdrawSubmission` 无 `reason` 入参。`requireReason` 约定（`types/task.ts:118-119`）用于**阻塞 / 取消 / 重开**等改变任务生命周期的动作，撤回提报不属此类 |
| **Q5-7** | 撤回是否允许审核人 / 管理员代提报人执行？ | **不允许**（仅提报人本人） | ① `permission.ts:33` 注释即「仅本人 `pending` 可撤回」；② 审核人已有**驳回**（原因必填 + 通知提报人），代撤回是重复能力；③ 扩大主体会新增越权面与测试面，超范围 |

---

## 8. 产品裁定表

| # | 问题 | 结论 | 理由（含实读证据） | 裁定人 |
| --- | --- | --- | --- | --- |
| **R5-1** | ① **列表内容互斥是否做？** | **不做**（Q4-12 就此闭合） | ① 用户可见的**错误数字已消除**：头部 N 用并集口径（`TodayFocusScreen.tsx:141` + `utils/focus.ts:29-41`），残留的只是**徽标之和**，而徽标 = 分组长度本身**正确**（`:108-115`）。② 三组是**三种视角**（日历日 / 角色 / 滚动 24h），不是划分；互斥会让每个列表**不再符合自己的定义**。③ **无论谁优先都会造成伤害**：「临期预警排除今日到期」会把**最紧急**的今日到期任务从预警里拿掉（安全退化）；反向「今日到期排除临期」会让「今天到期的都在这」不再成立。④ 实测证明**不是包含关系**（`task-016` ∈ 今日到期\临期、`task-018` ∈ 临期\今日到期）⇒ 「排除被包含者」这一自然修法根本不适用。⑤ `dropTask`（`TodayFocusScreen.tsx:154-167`）已同时从三组移除 ⇒ 重叠**不产生任何功能缺陷** | **PM（许清楚）** |
| **R5-2** | ② **`in_progress + submissionStatus='pending'` 是合法态还是脏数据？** | **合法态**（命名为「**审核轮回态**」）⇒ **本条不做收口**，`moveTask` 不清理是**正确**的 | ① 该组合由**产品自己**在「撤销审核通过」流程中写入（`TodayFocusScreen.tsx:247-257` 传 `{status:'in_progress', submissionStatus:'pending'}`）。② `resolveUndoReviewReset` 对 `'pending'` **刻意不清理**（`submission.ts:145-148`，K3 `:137-144`），目的正是让任务**留在**审核人队列。③ 该语义被 **4 个测试套件**保护（`increment2-qa.test.ts:177-199`、`increment2-completion.test.ts:96-100/351-371`、`round2-regression.test.ts:43-57`）。④ 判据的**不对称是语义正确的**：离开 `done` = 撤回完成声明 ⇒ 清理；非 `done` 的 `pending` 下任务仍在推进，离开状态（如 `in_progress → todo`）不应静默杀死一个待审提报（否则审核人再也看不到，正是 K3 要防的反向缺陷）。⑤ **推翻** 增量 2 §十-2 / `PRD-3` §8-9 的「缺口」措辞：这不是缺口，是**有意口径**，本增量以 §2.5 术语 + `M5-P0-05` 注释将其固化为契约 | **PM（许清楚）** |
| **R5-3** | ③ **撤回后回到哪个状态？** | **`in_progress`**；若当前**非** `done` 则**不改 `status`** | ① `TASK_TRANSITIONS.done = ['todo','in_progress']`（`types/task.ts:110`）⇒ `blocked` **不可达**，「回到提报前原状态」在 `blocked` 分支**物理不可表达**（`in_progress→done` 与 `blocked→done` 均合法，见 `:108-109`）。② 要真「回到原状态」需**新增持久化字段**记录提报前状态（`Task` 无此字段），超「不重构 / 零新增依赖」边界，且需为 `task-014/015` 回填不可知值。③ 既有 UI 已采用同一降级约定（`TodayFocusScreen.tsx:247-252`：`blocked → in_progress`）⇒ 固定 `in_progress` 与既有约定**一致且可预测**。④ 非 `done` 分支不改 `status`，可避免 `in_progress → in_progress` 这类**非法自迁移**抛 40902（`TASK_TRANSITIONS.in_progress` 不含自身，`types/task.ts:108`）。副作用见 §9-5 | **PM（许清楚）** |
| **R5-4** | ③ **谁能撤回？** | **仅提报人本人**；提报人 = `completion` 分支取 `assigneeId ?? createdBy`，其余取 `createdBy` | ① 完成提报的提报人在产品中就是 `assigneeId`（`submission.ts:191`，待我审核卡片显示「李娜 提交了完成提报」）；而 `withdrawSubmission` 用 `createdBy`（`task.service.ts:913`）⇒ 对 `task-014` 而言**真正的提报人李娜反而无权撤回，从未提报的张伟却有权**，属主体错位。② `permission.ts:33` 既有约定即「仅本人 `pending` 可撤回」。③ 审核人用**驳回**即可，无需代撤回（Q5-7） | **PM（许清楚）** |
| **R5-5** | ③ **是否必须填原因？** | **不必填**（可选，≤200 字） | 同 Q5-6：与 `undoCompletion.reason?`（`task.service.ts:413`）与 `withdrawSubmission`（无 `reason`）一致；`requireReason` 约定（`types/task.ts:118-119`）针对改变任务生命周期的动作 | **PM（许清楚）** |
| **R5-6** | ③ **是否发通知？** | **不发**（登记 §9-1） | 同 Q5-1：硬约束「不得动通知系统」+ 与 `undoCompletion` 零通知口径一致 | **PM（许清楚）** |
| **R5-7** | ③ **与 `undoCompletion` 的关系：复用还是新增？** | **新增独立入口 `withdrawCompletion`；`undoCompletion` 零改动** | ① **语义不同**：`undoCompletion` = 撤销「**我刚刚标记完成**」这个动作（含撤销「审核通过」），目标状态由调用方给（原状态）、仅存在于数秒 Toast 窗口（`TodayFocusScreen.tsx:241-266`）；`withdrawCompletion` = 撤回「**已提交的完成提报**」，让任务退出审核队列继续推进，是**持久**入口。② **风险不同**：复用 `undoCompletion` 必须放宽其 `submissionStatus` 三态契约（`task.service.ts:399-414`），会牵动 `increment2-*` / `round2-regression` 大量断言；新增函数回归面**为零**。③ 两者**共用**清理字段包唯一构造点 `createClearedReviewState()`，不产生第二份字段清单 | **PM（许清楚）** |
| **R5-8** | ③ **审核已通过 / 已驳回后还能撤回吗？** | **都不能**（`submissionStatus !== 'pending'` ⇒ 40302） | ① `SUBMISSION_TRANSITIONS.approved = []`（`submission.ts:22`）⇒ 已通过是**终态**，撤回会破坏审核结论与审计链；此时任务在 `done`，用户仍可用既有「重开为待办」（`TaskDetailScreen.tsx:129-133`）或 Toast 撤销（`TodayFocusScreen.tsx:254`）退出——**能力未丢失，只是换了名字**。② `rejected → draft` 是唯一合法后继（`submission.ts:23`）⇒ `rejected → withdrawn` 非法；且驳回后任务已回 `in_progress`（`task.service.ts:987`），不存在「待处理的提报」可撤回；要重提走 `completeTask`（`tests/increment2-completion.test.ts:298-305` 已覆盖该流程） | **PM（许清楚）** |
| **R5-9** | ③ **`withdrawSubmission` 是否同步改造为分叉？** | **不改**（新增独立函数），并登记 §9-6 | `status='cancelled'`（`task.service.ts:920`）对**提报记录**是**正确**的归档语义（与 `landSubmissionRecord:853` 同构，且被 `submission-flow.test.ts:247-255` 断言）；把它改成分支判断等于给既有函数加分支，回归面 > 收益。改用独立入口后语义边界清晰 | **PM（许清楚）** |
| **R5-10** | 本次是否顺带修 `SUBMISSION_TRANSITIONS` / 「重开为进行中」/ K15？ | **均不修**，全部登记 §9 | 命中范围铁律（§2.2 第 1/4/6 条）；且 `submission-flow.test.ts:76` 是**受保护断言**，修表必然触碰 | **PM（许清楚）** |

---

## 9. 已知限制（本次不做但必须登记）

| # | 限制 | 说明 | 来源 |
| --- | --- | --- | --- |
| **1** | **撤回不发通知** | 审核人的「待我审核」条目会**静默消失**（可能已收到过 `review.pending` 通知，见 `PRD-3` §8-2）。缓解：撤回后任务回到正式列表，点击原通知仍能看到真实状态 ⇒ 不产生错误决策。下一增量候选：新增 `review.withdrawn` 通知 | R5-6 / Q5-1 |
| **2** | **`SUBMISSION_TRANSITIONS` 仍是死表且与真实行为冲突** | 全仓无运行时调用（仅 `tests/submission-flow.test.ts:61-80` 断言纯函数）；表内 `approved → []` 与产品的 `approved → pending`（`TodayFocusScreen.tsx:257`）矛盾、缺 `rejected → pending`（`tests/increment2-completion.test.ts:298-305` 在跑）。本次**不得改表**（`submission-flow.test.ts:76` 锁定）⇒ **该表不是行为契约，勿据其推断运行时可写入集合** | R5-10 / §3.4 |
| **3** | **详情页「重开为进行中」标签与行为不符** | `TASK_TRANSITION_ACTIONS.done` 两项动作（`types/task.ts:142-145`）在 `TaskDetailScreen.tsx:129-133` **都**走 `reopenTask` ⇒ 恒落 `todo`（`task.service.ts:382`）。**既有缺陷，非本增量引入**，本次不修（`M5-P2-02`） | §3.3 / C3 |
| **4** | **`listTodayDue` 排除 `pending` 与审核轮回态语义冲突** | `task.service.ts:178` 排除待审中（K15），而 `:210-216` 不排除 ⇒ 审核轮回态任务（仍在推进）从「今日到期」消失却留在「临期预警」。增量 3 已登记为**有意差异**（`PRD-3` §8-12 / `ARCH-3` §9-5），本次沿用**不改** | R5-10 / Q5-5 |
| **5** | **撤回对 `blocked` 来源的任务会解除阻塞** | 由 `blocked` 完成的提报（`blocked → done` 合法）撤回后落 `in_progress`（`blocked` 不可从 `done` 到达，`types/task.ts:110`）⇒ 阻塞标记丢失，需用户手动「标记阻塞」。与既有「撤销完成」降级约定一致（`TodayFocusScreen.tsx:250-252`） | R5-3 |
| **6** | **`withdrawSubmission` 对正式任务仍会写 `cancelled`（潜伏）** | 该函数未被收紧：若未来误接线到正式任务，`status` 会被写成 `cancelled`。当前唯一调用点 `MySubmissionsScreen.tsx:98` 的数据源已按 `isSubmissionRecord` 过滤（`task.service.ts:894`）⇒ **当前不可达**。建议下一增量加守卫（`M5-P2-04`） | R5-9 |
| **7** | **`isWithdrawable` 曾为死代码** | 修正前全仓零引用（仅 `submission.ts:90-95` 定义处），服务层内联了另一套 `createdBy` 判据 ⇒ 谓词与实现漂移。`M5-P0-02` 将其收敛为唯一判据并真正引用；**但 `withdrawSubmission` 的内联判据仍保留**（避免触碰其测试）⇒ 仓内仍有**两处**撤回主体判定 | M5-P0-02 |
| **8** | **① 的重叠数与运行时刻强相关** | `approaching` 是 24h 滑动窗口（`task.service.ts:208-215`）⇒ 与 `dueToday` 的重叠条数随钟点变化（增量 3 观测 3 条 ≈ 19:00–20:00；本次 21:46 观测 2 条）。**任何以固定条数写死的断言都会漂移**，AC 一律用「集合成员关系」而非条数 | §3.1 / `PRD-3` §8-10 |
| **9** | **单用户演示 / 内存库刷新复位** | `authService.login` 恒返回演示账号 ⇒ 「提报人 ≠ 审核人」的双角色场景**只能在单会话内用应用内切换角色验证**；整页刷新即回种子态。且 `task-014` 的 `assigneeId`（李娜）与演示账号（张伟）**不是同一人** ⇒ 演示「撤回」需先切到对应角色或用 `completeTask` 造自己的完成提报 | 增量 1/2/3 遗留 |
| **10** | **`task-014` / `task-015` 与「审核轮回态」同形但缺历史字段** | 二者定义区间（`seed.ts:434-457` / `:458-479`）**未设置** `reviewedBy` / `reviewedAt` / `reviewNote`（故为 `null`），而真正的轮回态经「撤销审核通过」后**会保留** `reviewedBy` / `reviewedAt`（`resolveUndoReviewReset` 对 `'pending'` 不清理）⇒ 种子是**同形不同史**的演示数据。不影响行为，但会让人误以为「从未审核过」 | R5-2 / §3.2 |

---

## 10. 修订记录

| 版本 | 日期 | 修订内容 |
| --- | --- | --- |
| **v1.0** | 2026-09-27 | 初版增量 4 PRD。范围 = 提报/审核状态机收口三件事（① 列表内容互斥 / ② 非 `done` 的 `pending` 收口 / ③ 完成提报撤回入口）。<br>**实读复核结论**：三件事中仅 ③ 需写代码；① 裁定**不做**（R5-1）、② 裁定**合法态不做收口**（R5-2）。<br>**纠正主理人 3 条转述**（C1 `SUBMISSION_TRANSITIONS` 位置与死表事实、C2 ① 非「包含关系」而是交叉重叠、C3 完成提报退出路径不止一条且「重开为进行中」标签与行为不符）。<br>**实测取证**（`2026-09-27T13:46Z`）：三分组取数、`task-014`/`task-015` 的 `status`/`submissionStatus`/`isSubmissionRecord`/`resolveApproveBranch`、徽标之和 12 vs 头部并集 10。<br>需求池 12 条（P0×5 / P1×3 / P2×4）；AC 14 条（行为 12 + 口径锚点 2）；INV 8 条；裁定 10 项（R5-1~R5-10）；待确认 7 条（均附建议裁定）；已知限制 10 条。<br>**回归基线实测**（开工前）：`npx jest --config jest.config.js` ⇒ **31 套件 / 502 用例全部通过**；`tests/` 目录内另有 `setup.ts` 与 `react-test-renderer.d.ts` 两个非测试文件（故目录条目数为 33） |
