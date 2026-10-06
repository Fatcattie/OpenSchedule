# 增量 PRD（增量 5）— OpenSchedule 移动端：提报 / 审核闭环补完

> 编号规则：本增量需求编号自 **`M6-`** 起（增量 1 = `M2-*`、增量 2 = `M3-*`、增量 3 = `M4-*`、增量 4 = `M5-*`）。
> 档位：**简单 PRD**（不含竞品 / 市场分析）。只写增量，不重述增量 1~4 已有内容。
> 本文所有行号均为**实读**结果（基准：`d:\GLMclaw\workspace\openschedule`，`2026-09-27T14:40Z`）。凡与主理人转述不一致处，见 §3.5。

---

## 1. 背景与范围

### 1.1 项目信息

| 项 | 值 |
| --- | --- |
| Language | 中文 |
| Programming Language | Vite + React + MUI + Tailwind CSS（本项目实际为 **Expo 57 / RN 0.86.3 / React 19 / TS 6**，沿用现状，不引入任何新框架） |
| Project Name | `openschedule`（应用在 `apps/mobile`） |
| 原始需求复述 | 用户拍板范围 =「**提报 / 审核闭环补完**」，含四件事：① 撤回通知（新增）② 「审核轮回态」在「今日到期」的可见性冲突 ③ `SUBMISSION_TRANSITIONS` 死表收口为真守卫 ④ `withdrawSubmission` 加守卫 |

### 1.2 本增量的一句话结论（先读这条）

> **四件事中，② 裁定「维持现状、只把冲突写清楚」；④ 可安全加固、建议做；① 与 ③ 均被既有「受保护断言」挡住，需要主理人/用户追加授权，或改用不触碰该断言的实现路径。**

| # | 事项 | 裁定 | 是否需写代码 |
| --- | --- | --- | --- |
| ① | 撤回通知 | **做**，但**不得写进 `withdrawCompletion` 函数体**（4 处受保护断言锁死「该函数零通知」）⇒ 新增包装函数 `withdrawCompletionAndNotify` | 是 |
| ② | K15 冲突 | **维持现状**（不改 `listTodayDue`）⇒ 冲突写清楚 + 语义归因入注释 | 仅注释 |
| ③ | 迁移表收口 | **做**，但**授权范围不足**：改表会同时打破 `tests/increment4-qa.test.ts:511-521`（2 条 expect），该处**未获授权** | 是（**待追加授权**） |
| ④ | `withdrawSubmission` 守卫 | **做**（零回归面，见 §5.4） | 是 |

### 1.3 范围（四件事）

- **S1**（①）：新增通知类型 `review.withdrawn` + 撤回成功后的派发链路（含三处映射同步）。
- **S2**（②）：**仅**把「审核轮回态 / 今日到期 / 临期预警」的口径冲突与**语义归因**写清楚（PRD + 代码注释，零行为变更）。
- **S3**（③）：`SUBMISSION_TRANSITIONS` 修正为**实读反推出的真实可写入集合**；`canTransition` 成为 `submissionStatus` 写入的**唯一守卫**。
- **S4**（④）：`withdrawSubmission` 增加 `isSubmissionRecord` 前置守卫（40302）。

### 1.4 显式「不做」清单（范围铁律）

| # | 不做 | 理由 |
| --- | --- | --- |
| N1 | 不改 `listTodayDue` 的过滤条件（**② 不做行为变更**） | 见 §3.2 与 R6-2：会**确定地重新引入**增量 3 刚修掉的重复计数 |
| N2 | 不改 `listDeadlineApproaching`（不补「排除 pending」） | 会打破 `increment3-dedup-notify.test.ts:258-267` / `increment3-qa.test.ts:305-316`（K15 锚点），且语义更差（把即将到期的任务从预警里藏起来） |
| N3 | 不改 `shouldClearReviewOnLeaveDone` / `moveTask` / `reopenTask` 的清理分支 | ARCH-4 K26 明文禁止（PRD-4 §2.2-2） |
| N4 | 不改 `withdrawSubmission` 的内联主体判据（仍保留 `task.createdBy !== actorId`） | `tests/increment4-qa.test.ts:598-605` 锁定；`withdrawSubmission` 的内联判据对**提报记录**与 `isWithdrawable` 语义等价（ARCH-4 §10-9） |
| N5 | 不改 `TASK_TRANSITIONS` / `TASK_TRANSITION_ACTIONS` / `types/task.ts` | ARCH-4 K21 / K25；且 `task-state-machine.test.ts` 逐字节锁定 |
| N6 | 不改种子数据（含 `notif-002` 的 `type`） | `seed-integrity.test.ts` / `seed-submissions.test.ts` 锁定；沿用 PRD-3 M4-P2-02 |
| N7 | 不为 `review.withdrawn` 补 `notification_preferences` 偏好项 | 沿用 PRD-3 §8-7 / F5 口径（`mockNotificationPreferences` 亦不含 `review.result` / `task.completed`） |
| N8 | 不回滚已发出的 `review.pending`（撤回时） | 沿用增量 3 Q4-3「不撤回」（最小改动） |
| N9 | 不引入任何新依赖；禁 `reanimated` / `gesture-handler`；用 `npm` / `npx`，**禁 `pnpm`** | 硬约束 |
| N10 | 除 §4.3 明确授权的断言外，**既有测试断言一字不改** | 硬约束 |
| N11 | 不改「我的待办」`listMyTodos` 的口径 | 本增量与它无冲突（见 §3.2 口径差异表） |
| N12 | 不做通知偏好页的新类型登记 / UI 改动 | 超范围 |

### 1.5 产品目标（3 个正交目标）

1. **闭环**：让「提报 → 审核 → 撤回」这条链路的**每一端都有可感知的反馈**——提报人撤回后，审核人**主动知道**提报被撤回，而不是只能自己发现条目消失。
2. **契约诚实**：让代码里唯一那张「提报状态机迁移表」**不再说谎**——表内容必须等于运行时的真实可写入集合，且成为写入的唯一守卫。
3. **零回归**：全部变更在既有 33 个测试套件的约束下完成；除显式授权处外，**既有断言逐字节不变**，且**可证明**无既有链路行为变化。

### 1.6 用户故事

| # | 故事 |
| --- | --- |
| US6-01 | **As a 审核人**，I want 在提报人撤回提报后收到一条明确的「提报已撤回」通知，so that 我不会因为「待我审核」条目静默消失而反复刷新、或误以为自己漏审了。 |
| US6-02 | **As a 审核人**，I want 撤回通知点开后能直接进入该任务详情，so that 我能确认任务当前的真实状态（是否回到推进中）。 |
| US6-03 | **As a 提报人**，I want 撤回成功与撤回失败（越权 / 版本冲突）有明确区分，so that 失败时不会误以为已经撤回、也不会打扰审核人。 |
| US6-04 | **As a 开发者**，I want 提报状态机的迁移表与真实行为一致、且非法写入被守卫拦下，so that 我阅读该表时能直接得到正确结论，不再需要「实读全仓反推」。 |
| US6-05 | **As a 开发者**，I want `withdrawSubmission` 在误接线到正式任务时**立即失败**而不是静默把正式任务写成 `cancelled`，so that 这类接线错误在开发期暴露而非上线后污染数据。 |

### 1.7 术语表（本增量新增 / 修订）

| 术语 | 定义 | 来源 |
| --- | --- | --- |
| **审核轮回态** | **非 `done`** 且 `submissionStatus === 'pending'`，且 `reviewRequired === true` / `reviewerIds` 非空，`completedAt === null`。合法态。 | ARCH-4 K26 / `utils/submission.ts:165-177` |
| **完成提报待审**（本增量新增区分） | `done` 且 `submissionStatus === 'pending'`。与「审核轮回态」**同字段组合、不同 `status`**。 | 本增量，实读 `task.service.ts:333-374` |
| **提报记录** | `source === 'submission'` **且** `submissionKind != null`（`isSubmissionRecord` 为真的对象）。**完成提报（task-014/015）不是提报记录**。 | `utils/submission.ts:63-68` |
| **撤回提报**（本增量用语） | 提报人撤回**正式任务**的完成提报 ⇒ `withdrawCompletion`。 | 增量 4 / R5-7 |
| **撤回新事项提报** | 提报人撤回**提报记录** ⇒ `withdrawSubmission`（归档为 `cancelled`）。 | 增量 1 / R5-9 |
| **幂等重写**（本增量新增） | `to === from` 的 `submissionStatus` 赋值（值未变化）。**不是迁移**，守卫放行。 | 本增量，见 §3.3 |
| **清理包**（复位） | `createClearedReviewState()` 产出的 6 字段包（含 `submissionStatus: null`）。**不是迁移**，不经守卫。 | `utils/submission.ts:141-150` |

---

## 2. 需求池

### P0（Must have）

| # | 需求 | 落点 | 可测判据 |
| --- | --- | --- | --- |
| **M6-P0-01** | 新增通知类型 `review.withdrawn`；**撤回提报成功后**向撤回前的全部审核人各派发 1 条（未读级去重） | `task.service.ts` 新增 `withdrawCompletionAndNotify`；`TaskDetailScreen.tsx:296` 改调包装函数 | AC-01 / AC-02 / AC-05 |
| **M6-P0-02** | 撤回失败（40302 / 40901）时**零通知、零副作用** | 包装函数内「先撤回成功、后派发」 | AC-03 |
| **M6-P0-03** | `withdrawCompletion` 函数体**保持零通知**（K24 边界不变） | 不改 `task.service.ts:957-1000` 的派发语义 | AC-04 |
| **M6-P0-04** | 三处映射同步：`NOTIFICATION_EVENT_LABEL` + `NOTIFICATION_ICON` + `domain.ts:98` 注释登记 | `types/domain.ts:125-133`、`screens/NotificationsScreen.tsx:24-32`、`types/domain.ts:98` | AC-06 / AC-07 |
| **M6-P0-05** | `withdrawSubmission` 增加 `isSubmissionRecord` 前置守卫（非法主体抛 **40302**） | `task.service.ts:904-929` | AC-08 / AC-09 |
| **M6-P0-06** | `SUBMISSION_TRANSITIONS` 修正为**实读反推的真实可写入集合** | `utils/submission.ts:19-25` | AC-10 |
| **M6-P0-07** | `canTransition` 成为 `submissionStatus` 写入的**唯一守卫**（7 处赋值点全接入；清理包与幂等重写豁免） | `utils/submission.ts` 新增守卫 helper + `task.service.ts` 7 处 | AC-11 ~ AC-14 |

### P1（Should have）

| # | 需求 | 说明 |
| --- | --- | --- |
| **M6-P1-01** | 为 `withdrawn → pending`（撤回后重新提报）补测试覆盖 | 实读全仓**零覆盖**该链路（`grep` 无「重新完成 / 重新提报」用例），而它在产品中**可达**：`withdrawCompletion` 置 `withdrawn` + `in_progress` ⇒ `completeTask`（`in_progress → done` 合法）再写 `pending` |
| **M6-P1-02** | 把「② 的语义归因」写成 `listTodayDue` 的**代码注释**（零行为变更） | 现有注释 `task.service.ts:168` / `:179` 只说「K15」，未说明「为何这条排除在 `status !== 'done'` 之后仍有意义」；补注释可防止后续增量误删 |

### P2（Nice to have / 登记项，本次不实现）

| # | 需求 | 登记理由 |
| --- | --- | --- |
| **M6-P2-01** | 让「审核轮回态」回到「今日到期」 | **需同时改 5 处受保护断言**（§3.2）+ 重开 Q4-4 / K15 + **会重新引入增量 3 修掉的重复计数** ⇒ 见 R6-2，**本次不做** |
| **M6-P2-02** | 为 `review.withdrawn` 补 `notification_preferences` 偏好项 | 沿用 PRD-3 §8-7（既有 `review.*` / `task.completed` 均无偏好项） |
| **M6-P2-03** | 把 `withdrawSubmission` 内联主体判据收敛为 `isWithdrawable` | ARCH-4 §10-9 / K20 残留的第二处主体判定；本次为不触碰 `increment4-qa.test.ts:598-605` 而保留 |
| **M6-P2-04** | 纠正种子 `notif-002` 的 `type`（`task.assigned` → `review.pending`） | PRD-3 M4-P2-02 / F4（改种子会触碰 `seed-integrity.test.ts`） |
| **M6-P2-05** | 撤回时回滚已发出的 `review.pending` | 增量 3 Q4-3 明确「不撤回」 |
| **M6-P2-06** | `listTodayDue` 的 `userId` 参数在 mock 分支生效（「今日到期」过滤为「我的」） | PRD-3 F2 / Q4-14，属既有行为变更 |
| **M6-P2-07** | 通知偏好页新增 `review.withdrawn` 开关 UI | 无实际影响（所有类型恒走 `in_app`） |
| **M6-P2-08** | ③ 的**降级登记**：若用户不追加授权 `tests/increment4-qa.test.ts:511-521`，则 `SUBMISSION_TRANSITIONS` 保持现状（继续与真实行为矛盾），`canTransition` 继续无运行时调用 | 见 R6-7 / §7-7：该表**不是行为契约**，勿据其推断运行时可写入集合 |

---

## 3. 现状与差距（行号级证据）

### 3.1 ① 撤回通知：现状与差距

**现状（实读）**

| 证据 | 行号 | 内容 |
| --- | --- | --- |
| `withdrawCompletion` 函数体 | `task.service.ts:957-1000` | 全函数体**无任何通知调用**；`pushAudit('submission.withdraw.completion', …)` 在 `:990-995` |
| 清理调用点 | `task.service.ts:984` | `applyClearedReviewState(task)` ⇒ 把 `reviewerIds` 置 `[]` |
| 覆写点 | `task.service.ts:985` | `task.submissionStatus = 'withdrawn'` |
| 上游通知（增量 3） | `task.service.ts:359-369` | `completeTask` 对 `task.reviewerIds` 逐人 `pushNotificationOnce({type:'review.pending'})` |
| 通知类型清单 | `types/domain.ts:125-133` | `NOTIFICATION_EVENT_LABEL` **实有 7 项** |
| 图标清单 | `NotificationsScreen.tsx:24-32` | `NOTIFICATION_ICON` **实有 7 项** |
| 类型注释 | `types/domain.ts:98` | `/** task.assigned / mention / deadline_approaching / ai.proposal / review.pending */` ⇒ **只列 5 项** |
| 去重写入器 | `data/index.ts:175-188` | `pushNotificationOnce`：三元组 = `userId` + `type` + `data.taskId`，未读判定字段 = **`readAt === null`** |
| 通知偏好种子 | `seed-extra.ts:286-327` | **仅 4 条**：`task.assigned` / `mention` / `deadline_approaching` / `ai.proposal` |
| 写入路径是否读偏好 | `data/index.ts:145-188` | `pushNotification` / `pushNotificationOnce` **完全不读** `notification_preferences` |

**差距（Gap）**

- **G1**：撤回提报后，审核人的「待我审核」条目**静默消失**（`listPendingReview:190-203` 要求 `submissionStatus === 'pending'`，撤回后为 `withdrawn`）；而审核人可能**已收到**增量 3 的 `review.pending` 未读通知 ⇒ 审核人**不会主动知道**「提报被撤回了」。
- **G2**：`domain.ts:98` 的注释**不是**完整类型清单（列 5 / 实有 7），本次再加 1 项后差距扩大为「列 5 / 实有 8」。
- **G3（受保护断言锁，本次**新增发现**）**：全仓有 **4 处**断言把「`withdrawCompletion` 零通知」**锁死**，其中 3 处是**源码级**断言：

| # | 位置 | 断言 | 类型 |
| --- | --- | --- | --- |
| L1 | `tests/increment4-qa.test.ts:569-572` | `withdrawBody` **not**.toContain(`'pushNotification'`) / (`'db.notifications'`) | 源码级 |
| L2 | `tests/increment4-withdraw.test.ts:351-354` | 同上（切片范围同） | 源码级 |
| L3 | `tests/increment4-qa.test.ts:303-316` | `JSON.stringify(db.notifications)` **逐字节相等** + `length` 不变 | 行为级 |
| L4 | `tests/increment4-withdraw.test.ts:238-254` | 同上 | 行为级 |

> ⚠️ **关键**：`'pushNotificationOnce'` **包含子串** `'pushNotification'` ⇒ L1 / L2 对 `pushNotificationOnce` **同样命中**。因此**无法**用「改用 `pushNotificationOnce`」绕过源码级断言。
>
> ⚠️ 且 ARCH-4 **K24**（`ARCH-mobile-increment-4.md:502`）明文规定「撤回动作**零通知**；**不得动通知系统**（不新增通知类型、不改既有通知函数）」⇒ ① 与该条铁律**直接冲突**。

**⇒ ① 的实现约束（裁定 R6-1）**：**不得**在 `withdrawCompletion` 函数体内派发通知。必须新增**包装函数** `withdrawCompletionAndNotify`，由屏幕唯一调用点改调它；`withdrawCompletion` 保持零通知 ⇒ L1~L4 **全绿**，K24 **不废止、仅收敛边界**（新增 K27，见 §9）。

### 3.2 ② 「审核轮回态」与「今日到期」的冲突

**三函数口径差异表（实读）**

| 维度 | `listTodayDue`<br>`task.service.ts:169-187` | `listDeadlineApproaching`<br>`task.service.ts:206-223` | `listMyTodos`<br>`task.service.ts:150-166` |
| --- | --- | --- | --- |
| 时间窗 | `dueAt !== null` **且** `toDateKey(dueAt, tz) === 今天`（`:175-176`） | `dueAt` ∈ `[now − 1h, now + 24h]`（`:209-210, 215-216`）——**滑动窗口，与日历日无关** | **无时间条件**（`dueAt` 不参与） |
| 归属人 | `userId` **未参与过滤**（mock 分支未使用；PRD-3 F2 / Q4-14） | `userId` **未参与过滤**（`:218` `void timezone`） | `task.assigneeId === userId`（`:155`） |
| `status` 排除 | `cancelled`（`:177`）、`done`（`:178`） | `done` / `cancelled`（`:213`） | `done` / `cancelled`（`:156-157`） |
| `submissionStatus` 排除 | **排除 `pending`**（`:179`，K15） | **不排除**（`:213` 仅 done/cancelled） | **排除 `pending`**（`:158`） |
| 提报记录守卫 | `!isSubmissionRecord(task)`（`:181`） | `!isSubmissionRecord(task)`（`:214`） | `!isSubmissionRecord(task)`（`:160`） |
| 排序 | `sortTasks`（`:183`） | `sortTasks`（`:219`） | `sortTasks`（`:162`） |

**⇒ 口径结论**：`listTodayDue` 与 `listMyTodos` **口径一致**（都排除 `pending`）；`listDeadlineApproaching` 是**唯一不排除** `pending` 者。冲突**只存在于**「今日到期 ↔ 临期预警」之间。

**关键归因（本次实读新增，决定 R6-2）**

`:178` 的 `task.status !== 'done'` **已经**排除了全部 `done` 任务。因此 `:179` 的 `task.submissionStatus !== 'pending'` 在它**之后**：

- 对 `done` 任务**完全无效**（已被 `:178` 排除）；
- 其**唯一实际效果**就是排除「**非 `done` 的 `pending`**」= **审核轮回态**。

**⇒ 这条排除条件除了「排除审核轮回态」之外，没有任何其他作用。** 它不是「顺手多写的一条」，而是增量 3 **刻意**用来消除 `task-014` 重复计数的**唯一手段**：

| 证据 | 行号 | 内容 |
| --- | --- | --- |
| 增量 3 的重复计数实测 | `PRD-mobile-increment-3.md` §8-3 | 实测重叠 **5 条**：`task-001` `task-004` `task-005` **`task-014`** `task-017` |
| `task-014` 的种子形状 | `seed.ts:434-457` | `status='in_progress'`（**非 done**）、`submissionStatus='pending'`、`reviewRequired=true`、`reviewerIds=['user-001']`、`completedAt=null`（`makeTask:181` 默认）、`dueAt=demoDayAt(0,19,0)` = **今天 19:00** |
| `task-015` 的种子形状 | `seed.ts:458-479` | 同上，`dueAt=demoDayAt(0,17,0)` = **今天 17:00** |
| ⇒ 二者**结构上就是**「审核轮回态」 | — | **且 `dueAt` 均在今天** ⇒ 一旦放行，**立刻**进入「今日到期」 |
| 增量 3 的显式登记 | `PRD-mobile-increment-3.md` §8-12 | 「本次**新增**的口径差异……**登记为已知限制，避免后续被误判为缺陷**」 |
| 增量 4 沿用不改 | `PRD-mobile-increment-4.md` §9-4 / `ARCH-mobile-increment-4.md` §10-3 | R5-10「均不修，全部登记 §9」 |
| 术语定义 | `utils/submission.ts:165-177` / ARCH-4 K26 | 「审核轮回态」= 合法态、任务仍在推进 |

**若让审核轮回态回到「今日到期」，会触碰的既有断言（实读，共 5 处 / 2 个文件）**

| # | 位置 | 断言 | 后果 |
| --- | --- | --- | --- |
| A1 | `tests/increment4-qa.test.ts:620-628` | **源码级**：`listTodayDue` 函数体**必须包含** `"task.submissionStatus !== 'pending'"` | 删除该条件 ⇒ **失败** |
| A2 | `tests/increment3-dedup-notify.test.ts:172-186` | 列表**精确等于** `['task-001','task-004','task-005','task-016','task-017']`；且**逐条** `submissionStatus !== 'pending'` | `task-014`/`task-015` 入列 ⇒ **失败** |
| A3 | `tests/increment3-dedup-notify.test.ts:188-198`（INV-6） | `dueIds` **不含** `task-014` / `task-015` | **失败** |
| A4 | `tests/increment3-dedup-notify.test.ts:200-204`（AC-03 / INV-5） | 「今日到期」∩「待我审核」**交集为空** | `task-014`/`task-015` 同现两组 ⇒ **失败（= 重复计数回归）** |
| A5 | `tests/increment3-qa.test.ts:121` | 当日 08:00 `dueToday` **精确等于** 5 个 id | **失败** |
| A6 | `tests/increment3-qa.test.ts:194-195` | `dueIds` 不含 `task-014` / `task-015` | **失败** |

> 另：`tests/increment3-qa.test.ts:305-316` / `increment3-dedup-notify.test.ts:258-267` 是 **K15 的正面锚点**（断言 `task-014` **留在**「临期预警」）。若反向去改 `listDeadlineApproaching`（N2），这两处也会失败。

**⇒ ② 的答案（裁定 R6-2）：维持现状。** 详细理由见 §6 / §7。

### 3.3 ③ `SUBMISSION_TRANSITIONS` 死表

**现状（实读）**

| 证据 | 行号 | 内容 |
| --- | --- | --- |
| 表定义 | `utils/submission.ts:19-25` | `draft: ['pending','published']`、`pending: ['approved','rejected','withdrawn']`、**`approved: []`**、`rejected: ['draft']`、`withdrawn: ['draft']` |
| 运行时调用点 | 全仓 `grep canTransition` | **`src/` 内零调用**（仅 `utils/submission.ts:83-87` 定义）；调用者**只有** `tests/submission-flow.test.ts` 与 `tests/increment4-qa.test.ts` ⇒ **死表** |
| 表内容与行为冲突 1 | `TodayFocusScreen.tsx:264` | `submissionStatus: current.kind === 'approve' ? 'pending' : null` ⇒ 撤销「审核通过」时写 **`approved → pending`** |
| 表内容与行为冲突 2 | `tests/increment2-completion.test.ts:298-305` | `task-015` 先 `reject`（`rejected`）→ 再 `completeTask` ⇒ 写 **`rejected → pending`** |
| 表内容与行为冲突 3（本次实读新增） | `task.service.ts:977-985` + `:341-345` | `withdrawCompletion` 置 `withdrawn` 且 `status='in_progress'` ⇒ 随后 `completeTask`（`in_progress → done` 合法，`types/task.ts:108`）再写 **`withdrawn → pending`**。**全仓零测试覆盖** |
| 表内容与行为冲突 4（本次实读新增） | `seed.ts:434-457` + `task.service.ts:339-345` | `task-014` 是 `in_progress + pending` ⇒ `completeTask` 写 **`pending → pending`**（幂等重写）。**全仓零测试覆盖** |

**`submissionStatus` 写入点全量盘点（`grep 'submissionStatus =' / 'submissionStatus:'`，实读）**

| # | 行号 | 上下文 | 写入值 | `from`（实读） | 语义 | 是否入守卫 |
| --- | --- | --- | --- | --- | --- | --- |
| W1 | `task.service.ts:345` | `completeTask` | `'pending'` | `task.submissionStatus`（可为 `undefined` / `null` / `'rejected'` / `'pending'` / `'withdrawn'`） | **迁移** | ✅ |
| W2 | `task.service.ts:431` | `undoCompletion` | `input.submissionStatus`（`'pending'` 或 `null`；`undefined` 不写） | `'approved'`（实测：5 个调用点全部先 `reviewSubmission('approve')`，见 `TodayFocusScreen.tsx:261-267`、`increment2-completion.test.ts:356-361`、`increment2-qa.test.ts:183-188` / `:232-235`、`increment3-qa.test.ts:332-337`、`round2-regression.test.ts:47-53`） | **迁移**（`null` 为复位） | ✅（仅 `to !== null`） |
| W3 | `task.service.ts:804` | `buildSubmissionRecord` | `'pending'` | —（**新对象字面量**） | **初始值** | ❌ 出范围 |
| W4 | `task.service.ts:850` | `landSubmissionRecord` | `'approved'` | `'pending'` | **迁移** | ✅ |
| W5 | `task.service.ts:920` | `withdrawSubmission` | `'withdrawn'` | `'pending'`（`:917` 门禁） | **迁移** | ✅ |
| W6 | `task.service.ts:985` | `withdrawCompletion` | `'withdrawn'` | ⚠️ **必须在 `:984` 的 `applyClearedReviewState` 之前捕获**，否则读到 `null` | **迁移** | ✅ |
| W7 | `task.service.ts:1026` | `reviewSubmission`（approve / completion 分支） | `'approved'` | `'pending'` | **迁移** | ✅ |
| W8 | `task.service.ts:1057` | `reviewSubmission`（reject） | `'rejected'` | `'pending'` | **迁移** | ✅ |
| W9 | `task.service.ts:728` | `insertTask` | `null` | —（**新对象字面量**） | **初始值** | ❌ 出范围 |
| — | `utils/submission.ts:127 / 143` | `createClearedReviewState` / `UndoReviewReset` | `null` | — | **复位包** | ❌ **明确豁免**（`null` 不是迁移目标） |

**⇒ 真实可写入集合（反推）**

| `from` | 可写 `to` | 实读依据 |
| --- | --- | --- |
| （无 / 初始） | `'pending'` | W3 / W9（对象字面量）+ W1 在 `from == null` 时 |
| `draft` | — | **`'draft'` 在全仓 `src/` 内零写入** ⇒ 仅类型预留（`SUBMISSION_STATUS_LABEL:34-40` 有文案） |
| `pending` | `'approved'` / `'rejected'` / `'withdrawn'` | W4 / W7（approve）、W8（reject）、W5 / W6（withdrawn） |
| `pending` | `'pending'`（幂等重写） | W1 on `task-014`（`seed.ts:434-457`） |
| `approved` | `'pending'` | W2（`TodayFocusScreen.tsx:264`） |
| `rejected` | `'pending'` | W1（`tests/increment2-completion.test.ts:298-305`） |
| `withdrawn` | `'pending'` | W1（`withdrawCompletion` 后重新完成提报） |
| 任意 | `null`（复位） | 清理包（**不经表**） |
| — | `'published'` | **全仓 `src/` 内零写入** ⇒ 仅类型预留（`landSubmissionRecord` 写的是 `'approved'`，`:850`） |

**⇒ 修正后的表（裁定 R6-3）**

```ts
export const SUBMISSION_TRANSITIONS = {
  draft: ['pending', 'published'],      // 保持：'draft' / 'published' 均为类型预留（运行时零写入）
  pending: ['approved', 'rejected', 'withdrawn'],
  approved: ['pending'],                // 修正：原 [] 与 TodayFocusScreen.tsx:264 矛盾
  rejected: ['draft', 'pending'],       // 修正：原 ['draft'] 缺 pending（increment2-completion.test.ts:298-305 在跑）
  withdrawn: ['draft', 'pending'],      // 修正：原 ['draft'] 缺 pending（撤回后重新完成提报，可达）
} as const
```

**守卫口径（裁定 R6-4）**

1. **守卫目标** = **状态变化**（`to !== from` 且 `to !== null`）；
2. **幂等重写**（`to === from`）**放行**，且**不进表**（不写自环，保持表语义为「状态变化」）；
3. **清理包**（`submissionStatus: null`）**不经** `canTransition`（`null` 不是迁移目标；复位 ≠ 迁移）—— `createClearedReviewState` / `applyClearedReviewState` / `resolveUndoReviewReset` 三条路径保持原样；
4. **新对象字面量**（W3 / W9）**不在守卫范围**（无 `from`）；
5. **接入点** = W1 / W2（`to !== null`）/ W4 / W5 / W6 / W7 / W8 共 **7 处赋值语句**。

### 3.4 ④ `withdrawSubmission` 缺守卫

**现状（实读）**

| 证据 | 行号 | 内容 |
| --- | --- | --- |
| 函数体 | `task.service.ts:904-929` | `assertVersion` → `task.createdBy !== actorId`（40302）→ `submissionStatus !== 'pending'`（40302）→ `task.submissionStatus='withdrawn'`（`:920`）+ **`task.status = 'cancelled'`（`:921`）** |
| 唯一调用点 | `MySubmissionsScreen.tsx:98` | `taskService.withdrawSubmission(target.id, target.version, userId)` |
| 数据源已过滤 | `task.service.ts:894-895` | `listMySubmissions` = `createdBy === userId && isSubmissionRecord(task)` ⇒ 送进来的**必然是提报记录** |
| ⇒ 结论 | — | `status='cancelled'` 对**提报记录**是正确归档（与 `landSubmissionRecord:854` 同构）；对**正式任务**是错的 ⇒ **当前不可达的潜伏缺陷** |

**差距**：若未来误接线到正式任务，会把**正式任务**写成 `cancelled`（静默数据污染），且**无任何守卫拦截**。

**影响面评估（实读）**

| 断言 | 位置 | 加守卫后 | 结论 |
| --- | --- | --- | --- |
| 非本人撤回 ⇒ 40302 | `tests/submission-flow.test.ts:240-245` | 记录 `isSubmissionRecord === true` ⇒ 越过新守卫 ⇒ 仍 40302 | ✅ 不受影响 |
| 本人撤回成功 ⇒ `withdrawn` + `cancelled` | `:247-255` | 同上，越过新守卫 ⇒ 语义不变 | ✅ 不受影响 |
| 非 pending 不可撤回 ⇒ 40302 | `:257-263` | 同上，越过新守卫 ⇒ 仍 40302 | ✅ 不受影响 |
| 源码级：`withdrawSubmission` 体含 `task.createdBy !== actorId` 与 `task.status = 'cancelled'` | `tests/increment4-qa.test.ts:598-605` | 新增守卫**不移除**这两行 ⇒ 两处 `toContain` 仍成立 | ✅ 不受影响 |
| `seed-submissions.test.ts` | 全文（`:19-55`） | **完全不调用** `withdrawSubmission` | ✅ 不受影响 |
| `task-014` / `task-015` | — | `isSubmissionRecord === false` ⇒ 新守卫会**拒绝**它们 | ✅ **这正是期望**（它们是正式任务的完成提报，正确入口是 `withdrawCompletion`） |

**⇒ ④ 可安全加固，零回归面**（裁定 R6-5）。

### 3.5 对主理人转述的实读复核（**4 条纠正**）

| # | 转述 | 实读结论 | 证据 |
| --- | --- | --- | --- |
| **C1** | ① 「`withdrawCompletion` 零通知」是**后果**，「撤回通知（新增）」是一件可以「加上去」的事 | ⚠️ **不准确**。该「零通知」不只是现状，而是被 **4 处断言 + K24 铁律** 锁定的**契约**。`'pushNotificationOnce'` 含子串 `'pushNotification'` ⇒ 源码级断言同样命中。**不能在 `withdrawCompletion` 函数体内派发**，必须走包装函数（或追加授权改 4 处断言）。 | `increment4-qa.test.ts:569-572`、`increment4-withdraw.test.ts:351-354`、`increment4-qa.test.ts:303-316`、`increment4-withdraw.test.ts:238-254`、`ARCH-mobile-increment-4.md:502`（K24） |
| **C2** | ③ 「唯一例外是 `tests/submission-flow.test.ts:76`」 | ⚠️ **授权范围不足**。改表内容还会**同时**打破 `tests/increment4-qa.test.ts:511-521`（`SUBMISSION_TRANSITIONS` **整表 `toEqual`** + `canTransition('approved','pending') === false`）。该处**未获授权** ⇒ 按现授权 ③ **不可执行**。 | `increment4-qa.test.ts:511-521` |
| **C3** | ③ 「产品实际会写 `approved → pending`（`TodayFocusScreen.tsx:257`）」 | ⚠️ **行号有误**（结论正确）。`:257` 是 `current.prevStatus === 'blocked'`；`submissionStatus` 的写入点是 **`:264`**，调用点是 `:261`。 | `TodayFocusScreen.tsx:257` vs `:264` |
| **C4** | ② 「审核轮回态任务从『今日到期』消失了」 | ✅ 结论正确，但**低估了严重性**：`:178` 的 `status !== 'done'` 已排除全部 `done` ⇒ **`:179` 的唯一作用就是排除审核轮回态**。即这条排除**不是副作用，而是增量 3 消除 `task-014` 重复计数的唯一手段**；且种子 `task-014`/`task-015` **结构上就是审核轮回态**、`dueAt` **都在今天** ⇒ 一旦放行会**立即**打破 6 处断言。 | `task.service.ts:178-179`、`seed.ts:434-479`、§3.2 |

**未纠正的转述（实读确认正确）**：① 的「`withdrawCompletion` 零通知」事实 ✅；① 的「`applyClearedReviewState` 把 `reviewerIds` 置 `[]`」✅（`task.service.ts:984` → `utils/submission.ts:145`）；① 的「`domain.ts:98` 注释列 5 / 实有 7」✅（§3.1）；③ 的「表是死表、`canTransition` 无运行时调用」✅；③ 的「表缺 `rejected → pending`」✅；④ 的「当前不可达、潜伏缺陷」✅。

> 微偏差（不影响结论）：`listTodayDue` 实为 `task.service.ts:169-187`（转述 `:167-183`）。

---

## 4. AC（验收标准）

> ⚠️ 所有 Given 中的种子任务状态均已**实读 `src/data/seed.ts` 核实**（见每条的「种子前提」）。历史上出现过的 `completeTask('task-001')` 陷阱（`todo → done` 非法 ⇒ 40902，`increment3-qa.test.ts:165-174` 有专门用例）**本增量不再重犯**。

### 4.1 ① 撤回通知（M6-P0-01 ~ M6-P0-04）

**AC-01 · 撤回成功 ⇒ 每位审核人各得 1 条 `review.withdrawn`**

- **Given**：`resetDatabase()` 后取种子 `task-014`。种子前提（`seed.ts:434-457`）：`status='in_progress'`、`submissionStatus='pending'`、`reviewRequired=true`、`reviewerIds=['user-001']`、`assigneeId='user-002'`、`createdBy='user-001'`、`completedAt=null`。记录 `const n0 = db.notifications.length`。
- **When**：`await taskService.withdrawCompletionAndNotify('task-014', { version: task.version, actorId: 'user-002' })`
- **Then**：
  1. `db.notifications.length === n0 + 1`
  2. `db.notifications[0].type === 'review.withdrawn'`
  3. `db.notifications[0].userId === 'user-001'`
  4. `db.notifications[0].readAt === null` 且 `status === 'sent'` 且 `channel === 'in_app'`
  5. `db.notifications[0].data?.taskId === 'task-014'`
  6. `db.notifications[0].title === '提报已撤回'`；`body` 含 `task-014` 的标题（`'完成提报：首页原型评审'`）
  7. 返回值的 `submissionStatus === 'withdrawn'`、`status === 'in_progress'`、`reviewerIds` 为 `[]`
- **反例约束**：**不得**用 `withdrawCompletion`（零通知入口）断言本条 —— 该入口的 `db.notifications` 必须逐字节不变（AC-04 / L3 / L4）。

**AC-02 · 接收人来源 = 撤回**前**的 `task.reviewerIds`（时序）**

- **Given**：`task-015`（`seed.ts:458-479`：`in_progress` + `pending`、`reviewerIds=['user-001']`、`assigneeId='user-003'`）。人为把 `reviewerIds` 扩为 `['user-001','user-004']` 并记录快照 `preReviewers = [...task.reviewerIds]`（照 `increment4-qa.test.ts:218-236` 的「构造非空值」姿势）。
- **When**：`withdrawCompletionAndNotify('task-015', { version, actorId: 'user-003' })`
- **Then**：
  1. 新增 `review.withdrawn` 通知的 `userId` 集合 **=== `preReviewers` 集合**（2 条）
  2. 撤回后 `findTask('task-015')!.reviewerIds` **=== `[]`**（证明通知**不依赖**清理后的值）
  3. 若把通知读取点放在 `applyClearedReviewState`（`:984`）**之后**，则集合会退化为空 ⇒ **实现约束：必须在 `:984` 之前捕获**
- **同源原则**：接收人来源 = `task.reviewerIds`（与 `listPendingReview:190-203` 的可见性判定同源，沿用 ARCH-3 K18 / `task.service.ts:360` 注释口径）。

**AC-03 · 撤回失败 ⇒ 零通知、零副作用**

- **Given-1**（主体不符）：`task-014` + `actorId='user-001'`（`createdBy` 但**非**提报人 ⇒ `isWithdrawable` 为假）。记录 `snapshot = JSON.stringify(db.notifications)`、`auditLen = db.auditFeed.length`。
- **When-1**：`withdrawCompletionAndNotify('task-014', { version, actorId: 'user-001' })`
- **Then-1**：抛 `{ code: 40302 }`；`JSON.stringify(db.notifications) === snapshot`；`db.auditFeed.length === auditLen`；`findTask('task-014')` 的 `submissionStatus` 仍 `'pending'`、`version` 不变。
- **Given-2**（陈旧版本）：`task-004` 先 `completeTask`（`seed.ts` 中 `task-004` 为 `in_progress` ⇒ `in_progress → done` **合法**），再以 `version - 1` 调用。
- **Then-2**：抛 `{ code: 40901 }`；`db.notifications` 逐字节不变。

**AC-04 · `withdrawCompletion` 函数体仍零通知（K24 边界不变）**

- **Given**：`readFileSync('../src/services/task.service.ts')`，切片 = `indexOf('export async function withdrawCompletion')` → `indexOf('export async function reviewSubmission')`
- **Then**：切片 `not.toContain('pushNotification')` 且 `not.toContain('db.notifications')`（= L1 / L2 **原样通过**）
- **且**：`db.notifications` 在直接调用 `withdrawCompletion` 前后**逐字节相等**（= L3 / L4 **原样通过**）

**AC-05 · 未读级去重（`pushNotificationOnce`）**

- **Given**：先经 AC-01 派发 1 条 `review.withdrawn`（`readAt === null`）
- **When**：对同一 `taskId` + 同 `type` 再次派发
- **Then**：返回 `null`；`db.notifications.length` **不变**（且 `nextId` 序号不消耗，照 `data/index.ts:171` 约定）
- **Given-变体**：把首条 `readAt` 置为非 `null`（已读）
- **Then-变体**：派发**成功**（+1 条）

**AC-06 · 三处映射同步**

- **Then-1**：`NOTIFICATION_EVENT_LABEL['review.withdrawn'] === '撤回提醒'`（`types/domain.ts`）
- **Then-2**：`NotificationsScreen.tsx` 的 `NOTIFICATION_ICON` 含 `'review.withdrawn': 'corner-up-left'`；图标名合法性由 `Record<string, keyof typeof Feather.glyphMap>` 强类型 + `npx tsc --noEmit` 兜底。**实读校验**：`node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Feather.json` 共 **287** 个字形，`corner-up-left` **存在**（同批校验：`rotate-ccw` / `x-circle` / `minus-circle` / `file-minus` / `arrow-left` 存在；`undo` / `redo` / `reply` / `ban` / `arrow-uturn-left` **不存在**）
- **Then-3**：`types/domain.ts:98` 的注释行**同时**含 `review.withdrawn` 与既有全部 7 项（见 AC-07）

**AC-07 · 注释补全不破坏既有断言**

- **Given**：`readFileSync('../src/types/domain.ts')`，`source.split('\n').find(line => line.includes('task.assigned / mention / deadline_approaching'))`（= `increment3-dedup-notify.test.ts:466-473` 的取法）
- **Then-1**：`commentLine` **非 undefined**
- **Then-2**：`commentLine` 含 `'review.pending'`
- **Then-3**：`commentLine` 含 `'review.withdrawn'`
- **实现约束（硬）**：该注释**必须保持单行**，且**必须保留子串** `task.assigned / mention / deadline_approaching` 与 `review.pending`（换行 / 改分隔符都会打破既有断言）
- **建议终值**：`/** task.assigned / mention / deadline_approaching / ai.proposal / task.completed / review.result / review.pending / review.withdrawn */`

### 4.2 ④ `withdrawSubmission` 守卫（M6-P0-05）

**AC-08 · 正式任务不可经 `withdrawSubmission` 撤回（新行为）**

- **Given**：种子 `task-014`（`source='submission'`、**`submissionKind` 缺失** ⇒ `isSubmissionRecord === false`；`submissionStatus='pending'`、`createdBy='user-001'`）。记录 `v0 = task.version`。
- **When**：`withdrawSubmission('task-014', v0, 'user-001')`
- **Then**：
  1. 抛 `{ code: 40302 }`（`ERR_SUBMISSION_FORBIDDEN`）
  2. `findTask('task-014')!.status === 'in_progress'`（**未**被写成 `cancelled`）
  3. `submissionStatus === 'pending'`、`version === v0`（零变化）
- **说明**：本条为**新行为**（此前会写 `cancelled`）；因唯一调用点数据源已过滤，**用户不可达**，属纯加固。

**AC-09 · 提报记录路径零回归**

- **Given**：`const record = await submitItem({ kind: 'task', title: '守卫回归用例' }, 'user-002')` ⇒ `isSubmissionRecord === true`、`submissionStatus === 'pending'`
- **When**：`withdrawSubmission(record.id, record.version, 'user-002')`
- **Then**：`submissionStatus === 'withdrawn'`、`status === 'cancelled'`、`version === record.version + 1`
- **等价性**：与 `tests/submission-flow.test.ts:247-255` 同语义 ⇒ 该套件应**全绿**。
- **补充 Then**：非本人（`'user-003'`）⇒ 仍 40302；非 `pending`（撤回后再撤）⇒ 仍 40302。

### 4.3 ③ 迁移表 + 守卫（M6-P0-06 / M6-P0-07）

**AC-10 · 表内容 = 真实可写入集合**

- **Then-1**：`SUBMISSION_TRANSITIONS` 满足
  ```
  { draft: ['pending','published'],
    pending: ['approved','rejected','withdrawn'],
    approved: ['pending'],
    rejected: ['draft','pending'],
    withdrawn: ['draft','pending'] }
  ```
- **Then-2**（修正后应**为真**）：`canTransition('approved','pending') === true`、`canTransition('rejected','pending') === true`、`canTransition('withdrawn','pending') === true`
- **Then-3**（应**仍为假**）：`canTransition('draft','approved') === false`、`canTransition('pending','draft') === false`、`canTransition('pending','published') === false`、`canTransition('approved','rejected') === false`、`canTransition('rejected','approved') === false`、`canTransition('withdrawn','approved') === false`

**AC-11 · 守卫接入且零行为变更（7 条既有链路全绿）**

- **Then**（逐条跑通，**不得抛错**）：
  1. `completeTask('task-004', …)`（`in_progress → done`；`from = undefined` ⇒ 初始写入）
  2. `undoCompletion('task-014', { status:'in_progress', submissionStatus:'pending' })`（`from = 'approved'`）
  3. `reviewSubmission('task-014','approve',…)`（`from = 'pending'`）
  4. `reviewSubmission('task-015','reject',…,'说明不充分')`（`from = 'pending'`）
  5. `withdrawSubmission(<submitItem 记录>, …)`（`from = 'pending'`）
  6. `withdrawCompletion('task-004', …)`（`from` 在 `applyClearedReviewState` 前捕获 = `'pending'`）
  7. `submitItem({kind:'project'}, 'user-001')`（manager 免审 ⇒ `landSubmissionRecord` 写 `approved`，`from = 'pending'`）

**AC-12 · 幂等重写放行（`to === from`）**

- **Given**：种子 `task-014`（`status='in_progress'`、`submissionStatus='pending'`、`reviewerIds=['user-001']`）
- **When**：`completeTask('task-014', { version: task.version })`
- **Then**：**不抛错**；`submissionStatus === 'pending'`；`status === 'done'`；`reviewerIds === allManagerIds()`（`:347`）
- **依据**：`TASK_TRANSITIONS.in_progress` 含 `'done'`（`types/task.ts:108`）⇒ 任务状态机放行；提报状态机侧为 `pending → pending`（幂等重写）。

**AC-13 · 清理包不经守卫**

- **Then-1**：`undoCompletion('task-004', { status:'in_progress', submissionStatus: null })` **不抛错**，`submissionStatus === null`、`reviewRequired === false`、`reviewerIds === []`
- **Then-2**：`moveTask(<done+pending 任务>, { status:'in_progress' })` **不抛错**，六字段全清（`shouldClearReviewOnLeaveDone` 路径）
- **Then-3**：`withdrawCompletion('task-014', …)` **不抛错**（内部先复位到 `null`、再覆写 `withdrawn`）

**AC-14 · 守卫是唯一入口（源码级计数）**

- **Given**：`readFileSync('../src/services/task.service.ts')`
- **Then**：`submissionStatus` 的**赋值语句**共 **7** 处（`:345` / `:431` / `:850` / `:920` / `:985` / `:1026` / `:1057`），且**每一处的紧邻前文都出现守卫调用**（形如 `assertSubmissionTransition(`）；`insertTask:728` 与 `buildSubmissionRecord:804` 的对象字面量**不在**计数内（初始值）。
- **反向**：`utils/submission.ts` 内 `createClearedReviewState` / `applyClearedReviewState` 相关路径**不得**出现守卫调用（复位豁免）。

**AC-15 · `withdrawn → pending` 覆盖（M6-P1-01）**

- **Given**：种子 `task-014`（`in_progress` + `pending`，`assigneeId='user-002'`）
- **When**：① `withdrawCompletionAndNotify('task-014', { version, actorId:'user-002' })` ⇒ `withdrawn`；② `completeTask('task-014', { version: ①.version })`
- **Then**：② 返回 `submissionStatus === 'pending'`、`status === 'done'`；且 `listPendingReview('user-001')` 重新包含 `task-014`

### 4.4 ② 口径锚点（零行为变更）

**AC-16 · 三函数口径未变（回归锚点，逐条锁定）**

- **Then-1**：种子态下 `listTodayDue('user-001','Asia/Shanghai')` 的 id 集合 **===** `{task-001, task-004, task-005, task-016, task-017}`（**逐条** `status !== 'done'`、`submissionStatus !== 'pending'`）
- **Then-2**：`task-014` / `task-015` **不在** `listTodayDue`，**在** `listPendingReview('user-001')`
- **Then-3**：`listTodayDue` ∩ `listPendingReview` **=== ∅**
- **Then-4**：`task-014`（把 `dueAt` 锚定到当日 23:59）**在** `listDeadlineApproaching`
- **Then-5**：源码级 —— `listTodayDue` 体含 `"task.status !== 'done'"`、`"task.submissionStatus !== 'pending'"`、`'!isSubmissionRecord(task)'`；`listDeadlineApproaching` 体含 `"if (task.status === 'done' || task.status === 'cancelled') return false"` 与 `'if (isSubmissionRecord(task)) return false'`
- **等价性**：Then-1~5 分别等价于 `increment3-dedup-notify.test.ts:172-186` / `:188-198` / `:200-204` / `:258-267`、`increment3-qa.test.ts:121` / `:194-195` / `:305-316`、`increment4-qa.test.ts:620-637` ⇒ **全部应原样通过**

**AC-17 · ② 的语义归因入注释（M6-P1-02，零行为）**

- **Then**：`listTodayDue` 的注释（`:168` 或 `:179` 附近）新增说明，明确：`status !== 'done'` 已排除全部 `done` ⇒ `submissionStatus !== 'pending'` 的**唯一作用**是排除「审核轮回态」，且这是**增量 3 消除 `task-014` 重复计数的唯一手段**（不是冗余、不可删）。
- **约束**：纯注释；`readFileSync` 类断言（`increment4-qa.test.ts:620-628`）只做 `toContain` ⇒ 追加注释**不破坏**它们。

---

## 5. INV（不变量）

| # | 不变量 | 可判定形式 |
| --- | --- | --- |
| **INV-1** | `withdrawCompletion` 函数体**零通知**（K24 边界不变） | 切片不含 `'pushNotification'` / `'db.notifications'`；直接调用前后 `db.notifications` 逐字节相等 |
| **INV-2** | 撤回通知的接收人 ⊆ 撤回**前**的 `task.reviewerIds`（与 `listPendingReview` 可见性同源，K18） | 新增通知 `userId` 集合 === 撤回前 `reviewerIds` 集合 |
| **INV-3** | 撤回失败（40302 / 40901）⇒ **零通知 + 零 audit + 零字段变更** | 失败路径后通知快照 / `auditFeed.length` / `version` 三者均不变 |
| **INV-4** | `submissionStatus === 'pending'` ⇒ `reviewRequired === true` 且 `reviewerIds` 非空 | 沿用 `increment2-qa.test.ts:224-241`（本增量不改） |
| **INV-5** | `completedAt != null ⟺ status === 'done'` | 沿用 `increment2-qa.test.ts:203-222`（本增量不改） |
| **INV-6** | `SUBMISSION_TRANSITIONS` ⟺ 真实可写入集合；**表中不含自环**（`to === from` 为幂等重写，守卫放行） | AC-10 + AC-12 |
| **INV-7** | `submissionStatus` 的**每一次状态变化**都必须经 `canTransition` 放行（唯一守卫） | AC-14（源码级计数）+ AC-11（7 链路零回归） |
| **INV-8** | 清理包（`submissionStatus: null`）**不经** `canTransition`（复位 ≠ 迁移） | AC-13 |
| **INV-9** | 去重三元组 = (`userId`, `type`, `data.taskId`) + 未读判定字段 **`readAt === null`**（**不**用 `status === 'sent'`） | 沿用 `increment3-qa.test.ts:194-269`（本增量不改） |
| **INV-10** | 除 §4.3 授权处外，**既有测试断言逐字节不变**；既有 33 套件全绿 | 全量复跑 |
| **INV-11** | 提报记录（`isSubmissionRecord === true`）**永不**出现在「今日到期 / 我的待办 / 项目任务 / 看板 / 日历 / 时间容器」；**仅**出现在「待我审核」与「我的提报」 | 沿用 `submission-flow.test.ts:285-321`（本增量不改） |
| **INV-12** | 撤回提报**永不**把 `status` 写成 `cancelled`；撤回新事项提报**必然**写 `cancelled` | 沿用 `increment4-withdraw.test.ts:267-289` + `submission-flow.test.ts:247-255` |

---

## 6. 待确认问题（逐条附**建议裁定**）

| # | 问题 | 我的建议裁定 | 理由 |
| --- | --- | --- | --- |
| **Q6-1** | ① 的通知类型名？ | **`review.withdrawn`** | ① 命名空间对齐既有 `review.pending` / `review.result`；② **增量 4 已预告此名**（`PRD-4` §9-1 / `ARCH-4` §10-1：「下一增量候选：新增 `review.withdrawn` 通知」）⇒ 沿用可保持文档链一致；③ 语义是「审核侧事件的撤回」，不是「提报人动作」（`submission.*` 命名空间已被 audit action 占用，混用会违反 ARCH-4 K21 的「两套状态机不混用」精神） |
| **Q6-2** | ① 的中文标签？ | **`'撤回提醒'`** | 对齐既有标签的**类目式**命名（`review.pending` → `'待审核提醒'`、`review.result` → `'审核结果'`），而非句子式 |
| **Q6-3** | ① 的图标（须合法 Feather 名）？ | **`'corner-up-left'`** | ① **已实读校验存在**（`Feather.json` 287 字形）；② 语义为「撤回 / 回退」，与 `review.pending` 的 `'inbox'`、`review.result` 的 `'award'` 不撞车；③ 备选 `rotate-ccw` / `x-circle` 语义偏「重做 / 取消」；④ 被否决：`undo` / `redo` / `reply` / `ban` / `arrow-uturn-left` 在 Feather **不存在**（实读 MISS） |
| **Q6-4** | ① 的标题 / 正文？ | `title='提报已撤回'`；`body='「{task.title}」的完成提报已被提报人撤回，无需审核'`；`data={ taskId }`（不新增字段） | 与 `completeTask` 的既有文案（`task.service.ts:366`：`「${task.title}」已完成提报，等待你的审核`）成对偶；`body` 明确「无需审核」直接回答审核人的第一疑问（我还要不要审？） |
| **Q6-5** | ① 的接收人来源与时序？ | **`task.reviewerIds`**（沿用 K18 同源原则）；**必须在 `applyClearedReviewState`（`task.service.ts:984`）之前捕获快照**；**只能在撤回成功后派发** | ① `listPendingReview:190-203` 的可见性判定即 `reviewerIds.includes(userId)` ⇒ 同源可保证「收到通知的人 = 曾看到该条目的人」；② `:984` 会把 `reviewerIds` 置 `[]` ⇒ 清理后读取必然为空（**主理人指出的陷阱属实**）；③ 先派发后撤回会在失败时产生「幽灵通知」 |
| **Q6-6** | ① 用 `pushNotificationOnce` 还是 `pushNotification`？ | **`pushNotificationOnce`**（未读级去重） | ① 与增量 3 Q4-2 / Q4-7 的既定口径一致（**同一 `taskId` + 同一 `type` 已存在未读 ⇒ 跳过**）；② 序列「提报 → 撤回 → 重新提报 → 再撤回」中，第二次撤回时首条 `review.withdrawn` **仍未读** ⇒ 跳过写入，但审核人的**未读提醒并未丢失**（与 Q4-10 的既有副作用同源，登记 §7-3）；③ 去重能避免**同一任务的反复撤回刷屏**（撤回是可重复发生的操作，而 `review.pending` 因去重也不重复 ⇒ 两侧口径对称） |
| **Q6-7** | ① 是否受 `notification_preferences` 约束？ | **不受** | ① **实读**：`pushNotification`（`data/index.ts:145-161`）与 `pushNotificationOnce`（`:175-188`）**完全不读** `notification_preferences`；偏好目前只被 `focus.service.getNotificationPreferences` / `updateNotificationChannels` 读写，**不参与写入判定**；② `mockNotificationPreferences`（`seed-extra.ts:286-327`）**仅 4 条**，既无 `review.result` / `task.completed`，也无 `review.pending` ⇒ 为 `review.withdrawn` 单独加约束会**破坏口径一致**（PRD-3 §8-7）；③ ⇒ 与**既有全部类型**同口径：不约束（N7 / M6-P2-02） |
| **Q6-8** | ① 是否排除提报人本人（若其同时是审核人）？ | **不排除** | 沿用增量 3 Q4-1：① 与增量 2 Q3-1（R8）一致；② 演示账号张伟既是操作人又是审核人，排除本人会导致演示环境**收不到任何通知、功能不可验证** |
| **Q6-9** | ② 审核轮回态是否应回到「今日到期」？ | **否，维持现状**（R6-2） | 见 §3.2：`task.service.ts:179` 的**唯一作用**就是排除审核轮回态，而这是增量 3 消除 `task-014` 重复计数的**唯一手段**；种子 `task-014`/`task-015` **结构上就是审核轮回态**且 `dueAt` 都在今天 ⇒ 放行会**立即**打破 6 处受保护断言（A1~A6），其中 A4 正是「交集为空」的**重复计数回归** |
| **Q6-10** | ② 是否反向去改 `listDeadlineApproaching`（也排除 `pending`）来消除冲突？ | **不做** | ① 会打破 K15 的 2 处正面锚点（`increment3-dedup-notify.test.ts:258-267`、`increment3-qa.test.ts:305-316`）；② 语义更差：把「即将到期」的任务从预警里藏起来 = **安全退化**；③ 与 R5-1 的「三组是三种视角」原则冲突 |
| **Q6-11** | ② 的残留冲突要不要在 UI 上补一句口径提示（如「待审中任务不计入今日到期」）？ | **不做**（登记 M6-P2-01 的伴生项） | 超「只做四件事」边界；且 PRD-4 R5-1 已裁定「三组是三种视角，不做互斥」，UI 补文案属新增产品面 |
| **Q6-12** | ③ 授权范围是否足够？ | **不足，需追加授权**：`tests/increment4-qa.test.ts:511-521`（2 条 `expect`） | 实读：该处 `expect(SUBMISSION_TRANSITIONS).toEqual({…approved: []…})` + `expect(canTransition('approved','pending')).toBe(false)` 与 `submission-flow.test.ts:76` 是**同向双重锁定**。只改 `:76` 而保留 `:511-521` ⇒ 套件**必然失败**。**若用户不追加授权，则 ③ 降级为「登记不做」**（M6-P2-08，见 §7） |
| **Q6-13** | ③ 表中是否加自环（`pending: [..., 'pending']`）以覆盖幂等重写？ | **不加**；改由守卫显式放行 `to === from` | ① 表的语义应保持为「**状态变化**」；② 自环会让 `canTransition` 变成弱守卫（无法区分「合法变化」与「无变化」）；③ 幂等重写是**写入层**的事实（`completeTask` 对 `task-014`），不属于状态机契约 |
| **Q6-14** | ③ 守卫对「`from == null`」如何处理？ | **仅放行 `null → 'pending'`**（唯一初始写入） | 实读：`null` 只在两条路径出现 —— `insertTask:728`（对象字面量，不在守卫内）与 `undoCompletion` 的清理（复位，豁免）。其余 `from == null` 的**迁移**只有 `completeTask`（`:345`，`from = undefined`）⇒ 收紧为「只允许写 `'pending'`」可保持守卫强度 |
| **Q6-15** | ③ 的守卫错误码 / 文案？ | **`40302`**（`ERR_SUBMISSION_FORBIDDEN`），文案 `'提报状态迁移不被允许'`（带 `details: { allowed_transitions }`，照 `assertTransition:103-110` 的姿势） | ① K22 约定：主体 / 前置态不合法 ⇒ 40302；② 复用既有错误码**不新增码**；③ `details` 便于定位（与 `40902` 的 `allowed_transitions` 一致） |
| **Q6-16** | ④ 守卫的检查顺序？ | `404`（不存在）→ **40901**（`assertVersion`）→ **40302**（`!isSubmissionRecord`，新）→ 40302（`createdBy`）→ 40302（`pending`） | ① 沿用 K22「乐观锁最优先」的既有顺序（`increment4-qa.test.ts:172-177` 锁定该优先级）；② 新守卫放在主体判定**之前**，因为「入口用错」比「你没权限」更根本；③ 该顺序下 `submission-flow.test.ts:240-263` 三条用例**逐条仍命中原分支** ⇒ 文案与错误码不变 |
| **Q6-17** | ④ 的守卫错误文案？ | `'该入口仅用于撤回新事项提报'` | 便于开发期定位误接线；不暴露内部字段名 |
| **Q6-18** | ① 的实现路径：包装函数 vs 追加授权改 4 处断言？ | **包装函数**（新增 `withdrawCompletionAndNotify`，落 `task.service.ts`） | ① 追加授权要改 **4 处断言 / 2 个文件**，远超「只此一处」的边界；② 包装函数方案下 L1~L4 **全部原样通过**、**K24 不废止**（只需新增 K27 收敛边界）；③ 通知逻辑仍留在 **service 层**（与 `completeTask` / `reviewSubmission` / `addComment` 同层），不破坏分层；④ 屏幕侧唯一调用点（`TaskDetailScreen.tsx:296`）改调包装函数，**无任何测试断言该行文本**（实读：`increment4-qa.test.ts:643` / `increment4-withdraw.test.ts:310` 只断言 `runTransition`） |

---

## 7. 已知限制（本次不做但必须登记）

| # | 限制 | 说明 | 来源 |
| --- | --- | --- | --- |
| **1** | **② 的口径冲突未消除** | 审核轮回态任务（如 `task-014`，`in_progress + pending`，今日 19:00 到期）**仍不在**「今日到期」，**仍在**「临期预警」。这是**有意口径**（不是缺陷）：`listTodayDue` = 「今天到期且**仍需我处理**」（待审中 ⇒ 球在审核人那边）；`listDeadlineApproaching` = 纯时间窗视图（无 actionability 过滤）。**任何以「审核轮回态在今日到期消失」为缺陷的判定都应被本条驳回** | R6-2 / Q6-9 / §3.2 |
| **2** | **② 若要改变，代价已量化** | 需同时改 **6 处**受保护断言（A1~A6，跨 `increment3-dedup-notify` / `increment3-qa` / `increment4-qa` 三个套件），并重开增量 3 已闭合的 Q4-4 / K15；且 A4（「今日到期 ∩ 待我审核 为空」）会**回归失败** = 重复计数回归 | §3.2 |
| **3** | **撤回 → 重新提报 → 再撤回时，第二条撤回通知被去重跳过** | 按 Q6-6 用 `pushNotificationOnce`：第二次撤回时首条 `review.withdrawn` 仍**未读** ⇒ 跳过写入。审核人的**未读提醒未丢失**（仍是准确的「提报被撤回」），但无法从通知区分是第几轮撤回。与增量 3 §8-4（Q4-10）的既有副作用**同源** | Q6-6 |
| **4** | **撤回后已发出的 `review.pending` 仍不回收** | 沿用增量 3 Q4-3（N8）⇒ 审核人通知列表可能同时存在「待你审核」（旧，未读）与「提报已撤回」（新）两条。点击旧通知后任务详情显示真实状态，**不产生错误决策** | 增量 3 §8-2 |
| **5** | **`review.withdrawn` 无通知偏好开关** | 沿用 PRD-3 §8-7 / F5（N7）：`mockNotificationPreferences` 亦不含 `review.result` / `task.completed` / `review.pending`。无实际影响（所有类型恒走 `in_app`，偏好不参与写入判定） | Q6-7 |
| **6** | **`withdrawSubmission` 内联主体判据仍保留（仓内两处主体判定）** | 为不触碰 `increment4-qa.test.ts:598-605` 而保留（N4）；二者对**提报记录**语义等价（`resolveApproveBranch ∈ {task, project}` ⇒ 主体 = `createdBy`） | ARCH-4 §10-9 / K20 |
| **7** | **③ 若未获追加授权，则整项降级为「登记」** | `M6-P2-08`：表继续与真实行为矛盾（`approved: []` vs 实际 `approved → pending`）。**该表不是行为契约，勿据其推断运行时可写入集合** | Q6-12 / ARCH-4 K23 |
| **8** | **`draft` / `published` 是纯类型预留** | 全仓 `src/` 内**零写入** `submissionStatus = 'draft'` 与 `= 'published'`（`landSubmissionRecord:850` 写的是 `'approved'`）⇒ 表中这两项**当前不可达**，保留以维持 `SUBMISSION_STATUS_LABEL` 与类型完整 | §3.3 |
| **9** | **`pending → pending` 与 `withdrawn → pending` 此前零测试覆盖** | `M6-P1-01` 补覆盖（AC-12 / AC-15）；在补齐前，这两条链路仅由**静态推理**保证可达 | §3.3 |
| **10** | **`listTodayDue` 的 `userId` 参数在 mock 分支仍未生效** | 「今日到期」显示全租户今天到期的任务，而非「我的」（PRD-3 F2 / Q4-14 / `M6-P2-06`） | 增量 3 遗留 |
| **11** | **种子 `notif-002` 的 `type` 仍与语义不符** | `'task.assigned'` 而非 `'review.pending'` ⇒ 演示中同一任务可能有两条语义重复且**不互相去重**的未读通知（PRD-3 F4 / `M6-P2-04`） | 增量 3 遗留 |
| **12** | **单用户演示 / 内存库刷新复位** | `authService.login` 恒返回演示账号 ⇒ 「审核人收到撤回通知」在演示环境需**单会话内**用应用内角色切换验证；且 `task-014` 的 `assigneeId`（李娜 = `user-002`）与演示账号（张伟 = `user-001`）**不是同一人** ⇒ 演示撤回需先切角色 | 增量 1~4 遗留 |
| **13** | **撤回对 `blocked` 来源的任务会解除阻塞** | 由 `blocked` 完成的提报撤回后落 `in_progress`（`blocked` 不可从 `done` 到达，`types/task.ts:110`）⇒ 阻塞标记丢失。**既有行为，非本增量引入** | 增量 4 §9-5 |
| **14** | **① 新增一个公开 service 函数（`withdrawCompletionAndNotify`）** | 为满足 INV-1 而引入的**唯一**新公开 API；代价是「撤回」出现两个入口（`withdrawCompletion` = 零通知底层、`withdrawCompletionAndNotify` = 产品入口）。**必须由屏幕调后者**，否则 ① 失效。建议在 `withdrawCompletion` 的 doc comment 上显式标注「⚠️ 产品入口请用 `withdrawCompletionAndNotify`」 | R6-1 / Q6-18 |

---

## 8. 产品裁定表

| # | 问题 | 结论 | 理由（含实读证据） | 裁定人 |
| --- | --- | --- | --- | --- |
| **R6-1** | ① **撤回通知写在哪一层？** | **新增包装函数 `withdrawCompletionAndNotify`**（`task.service.ts`）；`withdrawCompletion` 函数体**保持零通知** | ① 实读：**4 处**断言锁死「`withdrawCompletion` 零通知」——源码级 `increment4-qa.test.ts:569-572` / `increment4-withdraw.test.ts:351-354`，行为级 `increment4-qa.test.ts:303-316` / `increment4-withdraw.test.ts:238-254`；② `'pushNotificationOnce'` **含子串** `'pushNotification'` ⇒ 换函数名**无法绕过**；③ ARCH-4 **K24**（`:502`）明文「不得动通知系统」；④ 包装函数方案下 L1~L4 **全绿**、K24 **只需收敛边界**（新增 K27），且通知逻辑仍在 service 层（与 `completeTask:359-369` / `reviewSubmission:1032-1071` / `addComment:528-544` 同层）；⑤ 屏幕侧调用点 `TaskDetailScreen.tsx:296` 改调包装函数，**无断言锁定该行文本**（实读：`increment4-qa.test.ts:643` / `increment4-withdraw.test.ts:310` 只切片 `runTransition`） | **PM（许清楚）** |
| **R6-2** | ② **审核轮回态是否回到「今日到期」？** | **否，维持现状**；冲突写清楚 + 语义归因入注释 | ① **实读关键归因**：`task.service.ts:178` 的 `status !== 'done'` **已排除全部 `done`** ⇒ `:179` 的 `submissionStatus !== 'pending'` **唯一作用就是排除审核轮回态**（它不是冗余，是增量 3 的**唯一**去重手段）；② 增量 3 实测重叠 5 条含 **`task-014`**（`PRD-3` §8-3），而 `task-014` 形状 = `in_progress` + `pending` + `reviewerIds=['user-001']` + `completedAt=null`（`seed.ts:434-457`，`makeTask:181`）⇒ **结构上就是审核轮回态**，且 `dueAt=demoDayAt(0,19,0)` = **今天**；`task-015` 同（`:458-479`，今天 17:00）；③ 放行会**立即**打破 **6 处**受保护断言：A1 `increment4-qa.test.ts:620-628`（源码级）、A2 `increment3-dedup-notify.test.ts:172-186`、A3 `:188-198`、A4 `:200-204`（**交集为空 = 重复计数回归**）、A5 `increment3-qa.test.ts:121`、A6 `:194-195`；④ 本次唯一授权例外是 ③ 的 `submission-flow.test.ts:76`，**不含**上述任何一处；⑤ 语义上也站得住：`listTodayDue` = 「今天到期且**仍需我处理**」（待审中 ⇒ 球在审核人那边），`listDeadlineApproaching` = 纯时间窗视图（R5-1「三组是三种视角」）；⑥ 反向修 `listDeadlineApproaching` 亦否决（打破 K15 锚点 + 安全退化） | **PM（许清楚）** |
| **R6-3** | ③ **修正后的表内容？** | `{ draft:['pending','published'], pending:['approved','rejected','withdrawn'], **approved:['pending']**, **rejected:['draft','pending']**, **withdrawn:['draft','pending']** }` | 反推依据（逐条实读写入点）：① `approved → pending` = `TodayFocusScreen.tsx:264`（撤销「审核通过」）+ 5 个测试调用点全部先 `reviewSubmission('approve')`（`increment2-completion:356-361`、`increment2-qa:183-188` / `:232-235`、`increment3-qa:332-337`、`round2-regression:47-53`）；② `rejected → pending` = `completeTask`（`increment2-completion.test.ts:298-305` 在跑）；③ `withdrawn → pending` = `withdrawCompletion:977-985`（置 `withdrawn` + `in_progress`）→ `completeTask:339-345`（`in_progress → done` 合法，`types/task.ts:108`）⇒ **可达但全仓零覆盖**（`M6-P1-01` 补）；④ `draft` / `published` 在 `src/` 内**零写入** ⇒ 保留为类型预留（`§7-8`）；⑤ **不删** `draft: ['pending','published']`（`submission-flow.test.ts:63-64` 仍断言其为真） | **PM（许清楚）** |
| **R6-4** | ③ **守卫的适用范围？** | 守卫 = **7 处赋值语句**（`:345` `:431` `:850` `:920` `:985` `:1026` `:1057`）；**豁免** = 清理包（`null`）、新对象字面量（`:728` `:804`）、`to === from`（幂等重写） | ① `:431` 必须**只在 `to !== null` 时**接入（`submissionStatus: null` 是复位，`increment2-qa.test.ts:246-252` / `increment3-qa.test.ts:335` 依赖它）；② `:985` 必须**在 `:984` 之前捕获 `from`**（否则读到 `null`，与 ① 的接收人陷阱同源）；③ `to === from` 放行：`task-014`（`in_progress + pending`）+ `completeTask` ⇒ `pending → pending` **可达**（`seed.ts:434-457` + `types/task.ts:108`），若拒绝会**破坏产品可用性**；④ 表中**不加自环**（保持表 = 状态变化契约，Q6-13）；⑤ `from == null` 仅放行 `'pending'`（Q6-14） | **PM（许清楚）** |
| **R6-5** | ④ **是否加 `isSubmissionRecord` 守卫？** | **加**（40302，放在 `assertVersion` 之后、主体判定之前） | ① 实读零回归面：`submission-flow.test.ts:240-263` 三条用例的记录均由 `submitItem` 生成（`isSubmissionRecord === true`）⇒ 越过新守卫，语义与错误码**逐条不变**；`increment4-qa.test.ts:598-605` 只 `toContain('task.createdBy !== actorId')` / `toContain("task.status = 'cancelled'")` ⇒ 新增守卫**不移除**这两行；`seed-submissions.test.ts` **完全不调用** `withdrawSubmission`；② 唯一调用点 `MySubmissionsScreen.tsx:98` 的数据源已按 `isSubmissionRecord` 过滤（`task.service.ts:894-895`）⇒ 用户**不可达**，属纯加固；③ 正确性：`task-014` / `task-015`（完成提报）`isSubmissionRecord === false` ⇒ 新守卫会把它们**正确地**导向 `withdrawCompletion`（INV-12 的语义边界更清晰） | **PM（许清楚）** |
| **R6-6** | ③ **改动 `tests/submission-flow.test.ts:76` 的授权（显式、单独列出）** | **仅此一处**：`tests/submission-flow.test.ts:76` 由 `expect(canTransition('approved','pending')).toBe(false)` 改为 **`.toBe(true)`**。**其它既有断言仍一字不改**（含同 `describe` 内的 `:73-75` `:77-79`，以及 `:63-69` 的全部「合法迁移」断言） | ① **必须改**：`TodayFocusScreen.tsx:264` 在「撤销审核通过」时**确实**写 `approved → pending`（5 个测试调用点均在跑该路径）⇒ 原断言锁定的是一条**与产品行为相反的**结论；② 原断言的**意图**是「`approved` 是终态」，但该意图在**审核结论**意义上成立、在**提报状态机**意义上**不成立**（审核结论可被「撤销审核通过」推翻，`round2-regression.test.ts:43-60` 就是该语义的契约）；③ 改后 `:73-79` 的其余 6 条非法断言**全部仍为假**（AC-10 Then-3 逐条覆盖）⇒ 改动的**语义损失为零**，仅纠正一条错误结论 | **PM（许清楚）** |
| **R6-7** | ③ **授权范围不足的处置** | **追加授权请求**：`tests/increment4-qa.test.ts:511-521`（2 条 `expect`）。**若不予追加，则 ③ 整项降级为登记（`M6-P2-08`），本增量只做 ①②④** | 实读：`increment4-qa.test.ts:511-521` = `expect(SUBMISSION_TRANSITIONS).toEqual({… approved: [] …})` + `expect(canTransition('approved','pending')).toBe(false)` ⇒ 与 `:76` **同向双重锁定**。只改 `:76` 必然导致该套件失败（INV-10 要求全绿）。该处**未在本次授权清单内** ⇒ 我不擅自扩大授权，而是**显式上报** | **PM（许清楚）** |
| **R6-8** | `domain.ts:98` 注释是否顺带补成完整清单？ | **补**（纯注释、零行为变更） | ① 属 ① 的**既有约定义务**（增量 3 建立的「三处映射同步」：`NOTIFICATION_EVENT_LABEL` / `NOTIFICATION_ICON` / `domain.ts:98` 注释登记），本次新增类型**必须**登记 ⇒ **不是扩张**；② 现状：注释列 **5** 个（`task.assigned / mention / deadline_approaching / ai.proposal / review.pending`），`NOTIFICATION_EVENT_LABEL` 实有 **7** 个（+`task.completed` / `review.result`）⇒ 已缺口 2，本次若不补则缺口扩为 3（且主理人已指出「至今仍不完整」）；③ 零风险：`increment3-dedup-notify.test.ts:466-473` 只做 `find(line => line.includes('task.assigned / mention / deadline_approaching'))` + `toContain('review.pending')` ⇒ **保持单行 + 保留这两个子串**即通过（AC-07 锁定该约束）；④ 补齐后该注释成为**唯一完整类型清单**，可直接用于后续增量 | **PM（许清楚）** |
| **R6-9** | ① 的 `reason` 是否进通知正文？ | **不进** | ① `withdrawCompletion` 的 `reason` 是**可选**（`WithdrawCompletionInput.reason?: string`，`task.service.ts:937-938`，R5-5 裁定不必填）；② 撤回**原因**属提报人视角的说明，对审核人的价值低于「无需审核」这一行动指引；③ 若进正文，`body` 长度不可控（上限 200 字）⇒ 通知列表展示不稳；④ 原因仍写 `auditFeed`（`:990-995`），可追溯性不丢失 | **PM（许清楚）** |
| **R6-10** | 本次是否新增测试文件？ | **新增 1 个**：`tests/increment5-closure.test.ts` | 沿用增量 3 `M4-P1-01` 落点规则（新用例一律写**独立新文件**，K11 精神）⇒ 既有 33 个套件**一字不改**（除 R6-6 授权处） | **PM（许清楚）** |

---

## 9. 交付给架构师的实现约束清单（K27~K32，建议）

> 声明：`ARCH-mobile-increment-2.md` §7 的 K1~K12、`ARCH-mobile-increment-3.md` §7 的 K13~K18、`ARCH-mobile-increment-4.md` §7 的 K19~K26 **全部继续有效**。以下为本次**新增 / 收敛**，其中 **K27 是对 K24 的边界收敛（不废止 K24）**。

| # | 规则 | 说明 |
| --- | --- | --- |
| **K27** | **撤回通知的唯一派发点 = `withdrawCompletionAndNotify`**。`withdrawCompletion` 函数体**继续零通知**（K24 边界收敛为「该函数体」而非「撤回动作」）。 | 禁止在 `withdrawCompletion` 内出现 `pushNotification` / `pushNotificationOnce` / `db.notifications`（`increment4-qa.test.ts:569-572` / `increment4-withdraw.test.ts:351-354` 锁定）。 |
| **K28** | **接收人快照必须在审核态清理之前捕获**：`const reviewerIds = [...(task.reviewerIds ?? [])]` 必须位于 `applyClearedReviewState(task)`（`task.service.ts:984`）**之前**。 | 与 ③ 的 `from` 捕获（`:985`）**同一时序陷阱**，两处必须共用同一次「清理前快照」。来源 = `task.reviewerIds`（K18 同源）。 |
| **K29** | **撤回通知的写入器 = `pushNotificationOnce`**（未读级去重，三元组 = `userId` + `type` + `data.taskId`；未读判定 = `readAt === null`）。 | 与增量 3 Q4-2 / Q4-7 一致。**禁止**用 `status === 'sent'` 判未读。 |
| **K30** | **`submissionStatus` 的每一次状态变化都必须经 `canTransition` 放行**（7 处赋值点）；**豁免** = 清理包（`null`）、新对象字面量、`to === from`（幂等重写）。 | `to === from` 放行的**唯一**理由：`task-014`（`in_progress + pending`）+ `completeTask` ⇒ `pending → pending` 可达。**禁止**把自环写进 `SUBMISSION_TRANSITIONS`。 |
| **K31** | **`SUBMISSION_TRANSITIONS` 的修正值即为契约**（R6-3）。任何后续增量若发现新的可达迁移，**必须**同步改表 + 新增守卫接入点 + 补 AC。 | `draft` / `published` 保留为类型预留；`landSubmissionRecord` 写 `'approved'`（**不是** `'published'`），勿据表名推断。 |
| **K32** | **`domain.ts:98` 注释 = 通知类型完整清单**（三处映射同步的第 ③ 处）。**必须保持单行**，且**必须保留子串** `task.assigned / mention / deadline_approaching` 与 `review.pending`。 | `increment3-dedup-notify.test.ts:466-473` 的 `find(...)` + `toContain(...)` 依赖该形状。 |

---

## 10. 修订记录

| 版本 | 日期 | 修订内容 |
| --- | --- | --- |
| **v1.0** | 2026-09-27 | 初版增量 5 PRD。范围 = 「提报 / 审核闭环补完」四件事（① 撤回通知 ② K15 冲突 ③ 迁移表收口 ④ `withdrawSubmission` 守卫）。<br>**实读复核结论**：② 裁定**维持现状**（R6-2）；④ 裁定**做**（R6-5，零回归面）；① 裁定**做但不得写进 `withdrawCompletion`**（R6-1，改走包装函数 `withdrawCompletionAndNotify`）；③ 裁定**做但授权范围不足**（R6-7，需追加授权 `tests/increment4-qa.test.ts:511-521`，否则降级为 `M6-P2-08`）。<br>**纠正主理人 4 条转述**：C1 ①「零通知」不是现状而是被 4 处断言 + K24 锁定的契约（且 `pushNotificationOnce` 含子串 `pushNotification`，换函数名无法绕过）；C2 ③ 的授权范围不足（还锁定 `increment4-qa.test.ts:511-521`）；C3 `approved → pending` 的写入点是 `TodayFocusScreen.tsx:264` 而非 `:257`；C4 ② 的严重性被低估（`task.service.ts:179` 的**唯一作用**就是排除审核轮回态，且种子 `task-014`/`task-015` 结构上就是该态、`dueAt` 都在今天）。<br>**本次实读新增的关键事实**：① `submissionStatus` 写入点全量 **9 处**（7 处赋值语句 + 2 处对象字面量），反推出 3 条此前**零覆盖**的可达迁移（`withdrawn → pending` / `pending → pending` / `approved → pending` 的运行时调用点）；② `withdrawCompletion` 的**双重时序陷阱**（`reviewerIds` 与 `submissionStatus` 都必须在 `:984` 前捕获）；③ `Feather.json` 实有 **287** 字形，`corner-up-left` 存在，`undo` / `reply` / `ban` **不存在**。<br>需求池 **17 条**（P0×7 / P1×2 / P2×8）；AC **17 条**；INV **12 条**；裁定 **10 项**（R6-1~R6-10）；待确认 **18 条**（均附建议裁定）；已知限制 **14 条**；新增实现约束 **K27~K32**（K24 收敛，不废止）。<br>**回归基线（本文写作时实测，未改动任何源码）**：`tests/` 目录共 **33** 个测试套件（含 `increment4-qa` / `increment4-withdraw`）；`ARCH-mobile-increment-4.md:586` 记录的上次实测为 **31 套件 / 502 用例全绿**。<br>**明确不做**：见 §1.4 N1~N12。 |
