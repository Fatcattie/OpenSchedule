# QA 报告（增量 7）— OpenSchedule 移动端：审核功能对标既有审核实现

> 验证人：严过关（QA） · 日期：2026-09-30 · 轮次：**第 1 轮独立验证**
> 判据：`ARCH-mobile-increment-7-audit-alignment.md`（约 900 行，含 D1–D6 / M1–M3 拍板 + §2.6 授权改动清单 + §6 任务分解）· `PRD-mobile-increment-7-audit-alignment.md`
> 对标基准：`apps/web/src/pages/AuditPage.tsx`、`services/api/src/modules/tasks/tasks.service.ts`、`services/api/prisma/schema.prisma`
> 被验对象：工程师寇豆码自评「39 套件 / 759 用例全绿」的增量 7 实现（**新增 `tests/audit-center.test.ts` + 修改 `apps/mobile` 源码**）
> 独立性声明：`apps/mobile` 在 git 中为**未跟踪目录**（`?? apps/mobile/`），**无法 `git diff`**；本报告全部结论基于**独立复跑 + 实读源码 + 自建反例探针**，**不采信**工程师数字。

---

## 0. TL;DR

| 项 | 结论 |
| --- | --- |
| **独立复跑基线** | ✅ `npx jest --config jest.config.js` → **39 套件 / 759 用例全绿**（84.6s）；`npx tsc --noEmit` → **exit 0，零错误** |
| **D4 / M1 严格公式** | ✅ 成立：`task.service.ts:400` `needsReview = task.reviewRequired === true && task.isReviewTask !== true`；`completeTask` **只读** `reviewRequired`，**不再无条件**写 `reviewRequired` / `submissionStatus` |
| **M1 两条路径行为** | ✅ 成立：`reviewRequired:true` ⇒ `pending_review`（写提报态 / 生成子任务 / 发 `review.pending`）；`reviewRequired:false` **或** `isReviewTask:true` ⇒ 直落 `done`（不写提报态 / 不生成下级 / 不发通知） |
| **M3 待评审列** | ✅ 四处齐全（`boardColumnOrder` / `BOARD_COLUMNS` / `statusColor` / `STATUS_WEIGHT`）+ 看板实渲染 5 列 |
| **D5 审核中心页** | ✅ 新建 `AuditCenterScreen.tsx` + `AuditCenter` 路由 + 权限门禁入口；`MySubmissionsScreen` / `TodayFocusScreen` **未被四栏改造**；**独立渲染探针实测四栏可渲染** |
| **D6 待提报宽口径** | ✅ 成立：已通过未完成的任务**同时**出现在「待提报」与「审核通过」 |
| **B1 / B2 修正** | ✅ 成立：驳回阈值改 `REASON_MIN_LENGTH`（=4）；`handleRejectConfirm` 已有 `catch`（提示 + 刷新） |
| **列表可见性（自建反例）** | ✅ `pending_review` **不漏进** `listTodayDue` / `listDeadlineApproaching` / `listMyTodos`；**必进** `listPendingReview` |
| **INV-1（放宽）** | ✅ 全量遍历 `completedAt != null ⟺ status ∈ {done, pending_review}` **零违例** |
| **迁移表边界** | ✅ `pending_review → done / in_progress / todo` 合法；`→ cancelled / blocked` **抛 40902**；`TASK_TRANSITION_ACTIONS.pending_review === []` |
| **评审子任务闭环 / 防递归** | ✅ 驳回后重提**复用**同一条子任务；评审子任务自身完成 ⇒ 直落 `done` 且**无下级子任务** |
| **用户拍板语义（第四层）** | ✅ `createClearedReviewState()` 仍 **6 字段**含 `reviewRequired:false`；撤回/撤销后再完成 ⇒ 直落 `done`；评审子任务承接人收到 `task.review.pending`，计数断言已同步更新 |
| **硬约束红线** | ✅ 零新增依赖；无 `reanimated` / `gesture-handler`；裸 `<Pressable>` 白名单**恰 6 文件**；无 `borderRadius: <数字>`；动效仅 RN `Animated` |
| **断言是否被削弱** | ✅ 未发现削弱：无 `.skip` / `.only` / `xit` / 注释 `expect`；6 字段清理包与源码切片断言完整；`increment2-qa:158` 与 `increment5-closure:383` 仍断言 `'done'` |
| **问题清单** | P0 × 0、P1 × 0、P2 × 0、P3 × 6（**存疑 / 登记项**，均非阻塞；详见 §8） |
| **临时探针清理** | ✅ 验证用 **3 个临时探针文件（共 10 个临时用例）已全部删除**；`tests/` 目录仍为 **39 个测试文件**、**无残留**；**源码零改动** |

**一句话**：**实现是对的，可以验收。** 六层验证逐项成立，工程师自评数字经独立复跑**完全一致**；另发现 6 项非阻塞存疑（其中「撤销 / 撤回后再完成会遗留 `todo` 孤儿评审子任务」为唯一较实在的行为观察，已单独列明，供后续增量处理）。

---

## 1. 验证环境

| 项 | 值 |
| --- | --- |
| 工作目录 | `d:\GLMclaw\workspace\openschedule`（代码在 `apps/mobile`） |
| 运行时刻 | 2026-09-30（Asia/Shanghai） |
| 运行时 | Expo 57 / RN 0.86.3 / React 19 / TS 6 / Jest 29（`jest-expo` preset） |
| 命令 | `cd apps/mobile && npx jest --config jest.config.js` · `cd apps/mobile && npx tsc --noEmit`（**用 `npx`**；`package.json` **无 `test` 脚本**，必须走该命令） |
| 数据态 | 每个用例 `beforeEach(() => resetDatabase())`（内存库复位到种子） |
| 源码改动 | **QA 未修改 `src/` 下任何文件**；仅新增 3 个**临时探针**（跑后即删） |
| 依赖 | **零新增**（`package.json` 未改；无 `reanimated` / `gesture-handler`） |

---

## 2. 交付声明复核（独立复跑，不采信）

| 工程师声明 | QA 独立复核 | 结论 |
| --- | --- | --- |
| `tsc` 零错误 | 实测 `npx tsc --noEmit` → `TSC_EXIT=0` | ✅ 一致 |
| 39 套件 / 759 用例全绿 | 实测 `Test Suites: 39 passed, 39 total`；`Tests: 759 passed, 759 total`（84.623s） | ✅ **完全一致** |
| 新增 `tests/audit-center.test.ts` | 实读存在（406 行，覆盖派生纯函数 / 四栏筛选 / 子任务闭环 / 审核日志 / M1 分流 / M3 看板列） | ✅ 一致 |
| `package.json` 无 `test` 脚本 | 实读 `scripts` 段确无 `test` | ✅ 一致 |

---

## 3. 逐条决策落地（贴 `文件:行` + 原文）

### 3.1 D4 / M1 —— 严格公式 + 不再无条件改写

| 项 | 证据 | 结论 |
| --- | --- | --- |
| 严格公式 | `task.service.ts:400` `const needsReview = task.reviewRequired === true && task.isReviewTask !== true` | ✅ |
| 目标状态分流 | `task.service.ts:401` `const target: TaskStatus = needsReview ? 'pending_review' : 'done'` | ✅ |
| `needsReview` 分支 | `:408-420` 才写 `submissionStatus='pending'`（经 `assertSubmissionTransition`）、`reviewerIds=allManagerIds()`、`ensureReviewSubtask(task)`；**无** `task.reviewRequired = true` 写入（`:413` 注释明确「该标志已由创建期决定，此处只读」） | ✅ |
| 免评审分支 | `:421-422` 注释：免评审 / 评审子任务自身 ⇒ 直接完成，**不写提报态、不生成下级评审** | ✅ |
| `reviewRequired` 唯一写入点 | `createTask` / `insertTask`（`input.reviewRequired ?? false`） | ✅ |

### 3.2 M1 两条路径行为证据（套件 + 自建反例）

| 路径 | 证据 | 结论 |
| --- | --- | --- |
| `reviewRequired=false` | `audit-center.test.ts:351-362`：`done.status==='done'`、`submissionStatus` 为 `null`、无 `isReviewTask` 子任务、无 `review.pending` 通知 | ✅ |
| `reviewRequired=true` | `audit-center.test.ts:364-377`：`done.status==='pending_review'`、`submissionStatus==='pending'`、`reviewerIds===allManagerIds()`、生成子任务、`review.pending` 通知条数 `=== allManagerIds().length` | ✅ |
| 自建反例（我构造） | 见 §4 —— 用 `task-004`（种子 `reviewRequired=true`）实际 `completeTask` 落 `pending_review` 后逐项验证列表可见性 | ✅ |

### 3.3 M3 —— 「待评审」看板列（四处齐全）

| 位置 | 原文 | 结论 |
| --- | --- | --- |
| `theme/index.ts:48` | `export const boardColumnOrder: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'pending_review', 'done']` | ✅ |
| `types/task.ts:189-195` | `BOARD_COLUMNS` 含 `{ status: 'pending_review', label: '待评审' }` | ✅ |
| `theme/index.ts:28` | `pending_review: { color: '#C8871B', bg: '#FBF3E2', label: '待评审' }` | ✅ |
| `task.service.ts:90` | `STATUS_WEIGHT` 含 `pending_review: 3` | ✅ |
| 看板实渲染 5 列 | `services.test.ts:259-265`、`task-state-machine.test.ts:133-141`、`audit-center.test.ts:383-404`（`listBoardColumns` 含 `pending_review` 列，标签「待评审」） | ✅ |

### 3.4 D5 —— 新建审核中心页 + 既有页未改造

| 项 | 证据 | 结论 |
| --- | --- | --- |
| 新页存在 | `src/screens/AuditCenterScreen.tsx`（461 行） | ✅ |
| 路由注册 | `stacks.tsx:134` `<MainRootStack.Screen name="AuditCenter" component={AuditCenterScreen} />`；`types/navigation.ts:27` `AuditCenter: undefined` | ✅ |
| 入口 + 权限门禁 | `ProfileScreen.tsx:172-177` `{can('review:view_pending') ? <SettingRow label="审核中心" onPress={() => navigation.navigate('AuditCenter')} /> : null}` | ✅ |
| `MySubmissionsScreen` 未改造 | 全文**零** `AuditCenter` / `auditService` / `filterPendingReport` / `pending_review` 引用 | ✅ |
| `TodayFocusScreen` 未改造 | 无 `AuditCenter` / `filterPendingReport`；其 `SegmentedControl`（`:389`）为**既有 tab**（今日到期 / 待我审核 / 临期预警），非四栏 | ✅ |
| **可渲染** | **我另写临时渲染探针实测**：manager 下渲染出「审核中心」标题 + 四栏（待提报 / 待审核 / 审核通过 / 撤回审核）+ `pending_review` 任务落入「待审核」栏（badge 1） | ✅ |

### 3.5 D6 —— 「待提报」宽口径

| 项 | 证据 | 结论 |
| --- | --- | --- |
| 纯函数口径 | `utils/audit.ts:150-166` `filterPendingReport`：`isReviewTask !== true && status ∉ {done, cancelled} && deriveApprovalStatus !== 'pending'` | ✅ |
| 同现两栏 | `audit-center.test.ts:161-172`：任务 `f`（`status='in_progress'` + `submissionStatus='approved'`）同时命中 `filterPendingReport` 与 `filterApproved` | ✅ |

### 3.6 B1 / B2 修正

| 项 | 证据 | 结论 |
| --- | --- | --- |
| B1 阈值 | `TodayFocusScreen.tsx:566` `disabled={rejectReason.trim().length < REASON_MIN_LENGTH}`（`REASON_MIN_LENGTH = 4`，`types/task.ts:186`） | ✅ |
| B2 catch | `TodayFocusScreen.tsx:298-300` `catch (error) { showToast(getErrorMessage(error)) }` + `finally { await focus.refetch() }` | ✅ |

---

## 4. 主动反例（第三层：构造任务实测，非只读源码）

> 我用**临时探针**（跑后即删）构造真实任务并驱动状态迁移，以下为实测输出。

| 验证点 | 实测 | 结论 |
| --- | --- | --- |
| `pending_review` 不漏进 `listTodayDue` | `task-004`（assignee = 李娜）：构造前 due 集合含 `task-004`；`completeTask` 落 `pending_review` 后 due 集合**不含** `task-004` | ✅ |
| `pending_review` 不漏进 `listDeadlineApproaching` | 构造前 approaching 含 `task-004`；构造后**不含** | ✅ |
| `pending_review` 不漏进 `listMyTodos` | `listMyTodos(李娜)` 构造前 `['task-003','task-004']`；构造后 `['task-003']` | ✅ |
| `pending_review` **必进** `listPendingReview` | `listPendingReview(ME)` 含 `task-004` | ✅ |
| **INV-1（放宽）全量遍历** | `db.tasks.filter((t) => (t.completedAt != null) !== (t.status === 'done' \|\| t.status === 'pending_review'))` ⇒ **空** | ✅ 零违例 |
| 迁移表：`pending_review → cancelled / blocked` | `moveTask('task-004', { status: 'cancelled' })` ⇒ `rejects.toMatchObject({ code: 40902 })`；`blocked` 同理 | ✅ 非法拦截 |
| 迁移表：`pending_review → todo` | `reopenTask('task-004', { reason: '重开' })` ⇒ `status === 'todo'` | ✅ 合法 |
| 详情页零迁移按钮 | `TaskDetailScreen.tsx:140` `const availableActions = task ? TASK_TRANSITION_ACTIONS[task.status] ?? [] : []`；`TASK_TRANSITION_ACTIONS.pending_review === []` | ✅ |
| 子任务闭环：驳回后重提**复用** | 驳回后再 `completeTask` ⇒ `parentId==='task-004' && isReviewTask` 的子任务**长度恒为 1**，id 不变 | ✅ |
| 防递归：评审子任务自身完成 | 子任务 `moveTask(in_progress)` → `completeTask` ⇒ `status==='done'`、`submissionStatus` 不写、`parentId===child.id` 的下级子任务**长度 0** | ✅ |
| 撤回后再完成（用户拍板语义） | `withdrawCompletion` ⇒ `status='in_progress'`、`reviewRequired=false`；再次 `completeTask` ⇒ `status==='done'` | ✅ |

**通知（用户拍板②）**：`ensureReviewSubtask` 向评审子任务承接人发 `task.review.pending`（`task.service.ts:1370-1378`）；`audit-center.test.ts:240-243` 断言该通知存在；**计数断言已同步更新**——`increment3-dedup-notify.test.ts:340` `before + allManagerIds().length + 1`（注释明确 `+1` = 子任务承接人通知）、`:371-382` 未读 `4 → 6`（`+2`）。✅

---

## 5. 用户拍板产品语义（第四层）

| 项 | 证据 | 结论 |
| --- | --- | --- |
| `createClearedReviewState()` 仍 6 字段且含 `reviewRequired:false` | `submission.ts:149-158` 返回 `{ submissionStatus:null, reviewRequired:false, reviewerIds:[], reviewNote:null, reviewedBy:null, reviewedAt:null }`；`increment2-completion.test.ts:44-53` / `:66-74` 断言 6 字段 | ✅ |
| 撤回 / 撤销后再完成 ⇒ 直落 `done` | 自建探针实测；`increment2-qa.test.ts:158`（撤销路径）、`increment5-closure.test.ts:383`（撤回路径）仍断言 `'done'` | ✅ |
| 评审子任务承接人收到 `task.review.pending` | `task.service.ts:1370-1378`；`audit-center.test.ts:240-243`；计数断言见 §4 | ✅ |

> **说明**：`ARCH §2.6 分类 B` 曾将 `increment2-qa:157` / `increment5-closure:383` 列为「应改为 `pending_review`」，**该判定有误**——撤销 / 撤回经 `createClearedReviewState()` 把 `reviewRequired` 清成 `false` ⇒ 再次完成 `needsReview===false` ⇒ 正确落 `'done'`。工程师**保持 `'done'` 是正确处置**；架构师已据此更正 §2.6（分类 B 16 → 14，并加勘误）。

---

## 6. 硬约束红线（全仓静态审计）

| 约束 | 实测 | 结论 |
| --- | --- | --- |
| `package.json` 零新增依赖 | 实读 `dependencies` / `devDependencies` 无动效相关包 | ✅ |
| 无 `reanimated` / `gesture-handler` | `grep -rn "reanimated\|gesture-handler" src/ package.json` ⇒ 零命中；`increment-card-lift.test.tsx:285-292` 亦锁死 | ✅ |
| 裸 `<Pressable>` 白名单**恰 6 文件** | `BottomSheet / Button / Card / ScreenHeader / SegmentedControl / SwipeableRow`，各 1 处；其余 `src/` 文件无裸 `<Pressable`；断言在 `increment-card-lift.test.tsx:299-313` | ✅ |
| 无 `borderRadius: <数字>` | `grep -rnE "borderRadius: *[0-9]" src/` ⇒ 零命中；断言在 `increment-card-lift.test.tsx:294-297` | ✅ |
| 动效仅 RN 内置 `Animated` | 无第三方动效库引用 | ✅ |

---

## 7. 断言是否被「削弱」（第六层重点排查）

| 排查项 | 实测 | 结论 |
| --- | --- | --- |
| `.skip` / `.todo` / `xit(` / `it.only` / `describe.only` | 全仓 `tests/` + `src/` 搜索 ⇒ **零命中**（仅注释文本中出现 `todo` 字样） | ✅ |
| 被注释掉的 `expect(` | 搜索 `// expect(` / `/* expect(` ⇒ **零命中** | ✅ |
| 弱化 matcher（`toBe(值)` → `toBeTruthy()` 等） | 未见针对被改断言的弱化；现存 `toBeGreaterThan(0)` / `not.toBeNull()` 均为**既有**合法写法（如 `reviewerIds` 集合非空） | ✅ |
| **`increment2-qa.test.ts:158` 仍断言 `'done'`** | 原文 `expect(again.status).toBe('done')` | ✅ |
| **`increment5-closure.test.ts:383` 仍断言 `'done'`** | 原文 `expect(redo.status).toBe('done')` | ✅ |
| 6 字段清理包断言完整 | `increment2-completion.test.ts:44-53` / `:66-74`、`increment4-qa.test.ts:580-598` 六字段逐一 `toContain` | ✅ |
| 源码切片断言（`increment4-qa:551-576`） | 切片 `[withdrawCompletion, reviewSubmission)` **不含** `pushNotification` / `db.notifications` / `'cancelled'` / `reviewRequired: false` | ✅ |
| 源码切片断言（`increment4-withdraw:340-368`） | 同上四项均成立；新辅助函数 `appendAuditLog` / `ensureReviewSubtask` 置于**文件末尾**，未插入受保护切片 | ✅ |
| `toBe('pending_review')` 分布 | 全仓 **15 处**，均落在 `completeTask` 需评审路径，语义合理 | ✅ |

---

## 8. 存疑清单（6 项，均非阻塞）

> 逐项写「期望 vs 实际」+ 判断。

### 存疑 1 · 撤销 / 撤回后再完成会遗留 `todo` 孤儿评审子任务（唯一较实在的行为观察）

- **期望**：主任务完成并落 `done` 后，先前为它生成的评审子任务应随之收敛（关闭 / 取消 / 删除）。
- **实际**（我探针实测，两条路径均复现）：
  - 撤销路径：`completeTask` → `undoCompletion` → 再 `completeTask` ⇒ 主任务 `status='done'`，但先前生成的子任务 `task-1001` **仍为 `todo`**。
  - 撤回路径：`completeTask` → `withdrawCompletion` → 再 `completeTask` ⇒ 主任务 `status='done'`，子任务 `task-1008` **仍为 `todo`**。
- **影响**：承接人（`project.ownerId`）的待办里会残留一条「项目评审 — {标题}」，挂在一个**已完成**的主任务下。
- **判断**：这是用户拍板「撤回 / 撤销后不再需要评审」的**直接副作用**（`reviewRequired` 被清成 `false`，`completeTask` 走免评审分支，不再触碰既有子任务），**非崩溃 / 非数据损坏**；无测试覆盖。**已由 team-lead 立项为缺陷 A**，交架构师设计修复（两条路线待定：单点 `completeTask` else 分支 / 清理点收口）。

### 存疑 2 · `ensureReviewSubtask` 复用条件含 `cancelled`

- **期望**：仅复用「未完成的评审子任务」，被取消的不应复用。
- **实际**：`task.service.ts:1322-1327` 复用条件为 `parentId === mainTask.id && isReviewTask === true && task.status !== 'done'` ⇒ `cancelled` 子任务**也会被复用**。
- **判断**：当前流程不会把评审子任务置为 `cancelled`，故**理论不可达**；但一旦按存疑 1 的修复把子任务置 `cancelled`，该路径将变为**必须显式排除**。**已由 team-lead 立项为缺陷 C**，要求并入 A 的方案一并收紧。

### 存疑 3 · `ARCH §2.6 分类 B` 误列 2 条（文档问题，实现正确）

- **期望**：§2.6 分类 B 应准确列出「因引入 `pending_review` 而必须改」的断言。
- **实际**：该表把 `increment2-qa:157` / `increment5-closure:383` 列为「应改 `pending_review`」；但这两条走的是**撤销 / 撤回后再完成**路径（`reviewRequired` 已清 `false`）⇒ 正确值应为 `'done'`，**不该改**。
- **判断**：文档与实现不一致，**实现正确**；架构师已更正（分类 B 16 → 14 + 勘误标注）。

### 存疑 4 · 撤回后再完成，`submissionStatus` 残留 `'withdrawn'`

- **期望**：两条「再完成」路径的提报态归一化（撤回路径 vs 撤销路径应一致）。
- **实际**：撤回路径落 `submissionStatus='withdrawn'`（`increment5-closure.test.ts:384` 断言之）；撤销路径落 `null`。**两条路径不一致**。
- **判断**：不违反 INV-1 / INV-2 / INV-3（`withdrawn` 不在「pending ⇒ …」约束内，且 `reviewRequired=false` 故不进待审队列），但语义略脏。**已由 team-lead 立项为缺陷 D**，交架构师判断是否归一化为 `null`。

### 存疑 5 · `AuditCenterScreen` 无组件级渲染测试

- **期望**：`ARCH §6-T03` 验收标准要求「组件测试通过」。
- **实际**：现有 39 套件仅覆盖其**纯函数**（`utils/audit`）与**服务层**（`auditService` / `taskService`），**无** `AuditCenterScreen` 的组件渲染测试。
- **判断**：违反 ARCH 自身验收标准。我已用**临时渲染探针**证明其可渲染（四栏 + 权限门禁），但**证据未落库**。**已由 team-lead 立项为缺陷 B（必须补）**，要求补成正式组件测试（覆盖四栏 + 权限门禁 + 空态）。

### 存疑 6 · `completeTask` 的 `pushAudit` 动作恒为 `'task.complete'`（偏离 ARCH 伪码）

- **期望**：ARCH 伪码曾写 `pushAudit(needsReview ? 'task.submit_review' : 'task.complete', ...)`。
- **实际**：`task.service.ts:428-433` 恒写 `'task.complete'`（含注释：受保护断言 `increment2-completion.test.ts:263` 依赖它，不在 §2.6 授权改动范围）。
- **判断**：为保护**未授权改动**的既有断言而保留，工程师判断**正确**；审核语义由结构化 `AuditLog`（`appendAuditLog`）承载。已登记为工程师的**偏离 c4**。

---

## 9. 结论

**通过。**

- 六层验证逐项成立：独立复跑基线（39 / 759 + `tsc` 0）、已拍板决策 D4/M1/M3/D5/D6/B1/B2 全部落地、主动反例（列表可见性 / INV-1 / 迁移表 / 子任务闭环 / 防递归 / 用户拍板语义）全部实测通过、硬约束红线全过、断言未被削弱。
- 工程师自评数字（39 套件 / 759 用例）与 `tsc` 零错误经**独立复跑完全一致**。
- 6 项存疑均**非阻塞**：其中存疑 1 / 2 / 4 / 5 已被 team-lead 立项为缺陷 A / C / D / B（后续 7.1 修复），存疑 3 为文档勘误（已更正），存疑 6 为有据偏离（已登记）。

**后续（7.1 复验重点，待工程师实现后执行）**：
1. 孤儿在**撤回 / 撤销**两条路径上确实被消除；
2. **反向断言**：驳回路径的子任务**仍被复用、不得被误关**（防过度修复）；
3. `cancelled` 子任务**不再被复用**；
4. B 的组件测试确实覆盖四栏 + 权限门禁 + 空态；
5. 全量回归仍绿（新增用例后条数会变，以实际为准）。

---

## 附 · 临时探针清理声明

验证过程共使用 **3 个临时探针文件**（均位于 `apps/mobile/tests/`，跑后**立即删除**）：

| 临时文件 | 用途 | 临时用例数 | 状态 |
| --- | --- | --- | --- |
| `tests/__qa_tmp_probe.test.ts` | 列表可见性 / INV-1 / 迁移表 / 子任务闭环 / 防递归 / 撤回后再完成 | 7 | ✅ 已删 |
| `tests/__qa_tmp_probe2.test.ts` | 撤销 / 撤回后再完成的孤儿评审子任务探测 | 2 | ✅ 已删 |
| `tests/__qa_tmp_render.test.tsx` | `AuditCenterScreen` 四栏渲染探测 | 1 | ✅ 已删 |

**清理核实**：`tests/` 目录当前 **39 个 `.test.ts(x)` 文件**、**无 `__qa_tmp*` 残留**；`src/` 零改动。
