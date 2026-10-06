# QA 报告（增量 4）— OpenSchedule 移动端：提报 / 审核状态机收口

> 验证人：严过关（QA） · 日期：2026-09-27 · 轮次：**第 1 轮独立验证 + 智能路由判定**
> 判据：`PRD-mobile-increment-4.md` **v1.0**（AC-01~AC-14 / INV-1~INV-8 / R5-1~R5-10 / Q5-1~Q5-7）· `ARCH-mobile-increment-4.md` **v1.0**（T01~T06 / K19~K26 / §8 回归矩阵 29 行）
> 被验对象：工程师寇豆码自评 `IS_PASS: YES` 的增量 4 实现（**新增** 1 测试文件 + **修改 6 源码**）
> 独立复跑者：主理人齐活林（已确认 32 套件 / 531 用例全绿；QA 本轮**不采信**，全部重新实测）

---

## 0. TL;DR

| 项 | 结论 |
| --- | --- |
| **源码正确性** | ✅ **零缺陷**。B1（`withdrawCompletion` 新增）/ B2（详情页撤回入口）/ B3（`done → in_progress` 改走 `moveTask`）/ B4（`isWithdrawable` 分叉主体）**四处行为变更全部按 ARCH 落地**，与文档逐条一致 |
| **AC 通过率** | **14 / 14 = 100%**（AC-01~AC-14 全 PASS；AC-12 / AC-13 为环境级，经 `tsc` + `jest` + mtime 实测确认） |
| **INV 通过率** | **8 / 8 = 100%**（INV-1~INV-8 全 PASS） |
| **回归** | ✅ `npx tsc --noEmit` → **exit 0**；`npx jest --config jest.config.js` → **33 套件 / 586 用例全绿**（基线 31 / 502；工程师交付态 32 / 531；QA 新增 1 套件 / 55 用例） |
| **既有 31 套件零改动** | ✅ **100% 未被触碰**（mtime ≤ `19:01:19`，增量 4 施工窗口 = `22:03:42`~`22:06:50`）+ 4 处红线断言**逐字在位**（内容证据） |
| **对抗性用例** | ✅ 主体双向对照 / 重复撤回 / 零通知 / 非 `done` 不改 status / INV-1 全量遍历 / `task`+`project` 分支主体 / 校验顺序 / `blocked` 来源 **全部通过** |
| **问题清单** | P0 × 0、P1 × 0、**P2 × 1（QA 自修：我自己的 1 条过严断言，第 1 轮内已修正）**、P3 × 6（观察 / 建议项） |
| **智能路由判定** | 🟢 **NoOne** —— 源码零缺陷 + 全绿（33 / 586）。唯一失败是 **QA 新文件自身的断言 bug**（非源码缺陷），已在第 1 轮**自修完毕** |

**一句话**：**实现是对的，可以验收**。本轮唯一红过一次的是**我新写的 QA 用例中 1 条过严断言**（把「字段清单字面量全仓唯一」错判为「出现次数 = 1」，实为「接口类型声明 + 实现」两处），属**测试代码 Bug**，已由 QA 当场修正（详见 §8-P2-1）。

---

## 1. 验证环境

| 项 | 值 |
| --- | --- |
| 工作目录 | `d:\GLMclaw\workspace\openschedule\apps\mobile` |
| 运行时刻 | 2026-09-27 22:0x ~ 22:3x（Asia/Shanghai） |
| 运行时 | Expo 57 / RN 0.86.3 / React 19 / TS 6 / Jest 29（`jest-expo` preset） |
| 命令 | `npx tsc --noEmit` · `npx jest --config jest.config.js`（**用 `npx`，未用 `pnpm`**） |
| 数据态 | 每个用例 `beforeEach(() => resetDatabase())`（内存库复位到种子） |
| 源码改动 | **QA 未修改 `src/` 下任何文件**（铁律遵守）；仅新增 `tests/increment4-qa.test.ts` |
| 依赖 | **零新增**；`grep -rn "reanimated\|gesture-handler" src/` → **无命中**（exit 1） |

---

## 2. 交付声明复核（独立复跑，不采信）

| 工程师声明 | QA 独立复核 | 结论 |
| --- | --- | --- |
| `tsc` exit 0 | 实测 `TSC_EXIT=0` | ✅ 一致 |
| 32 套件 / 531 用例全绿（基线 31/502） | 实测 `Test Suites: 32 passed, 32 total / Tests: 531 passed, 531 total` | ✅ 一致 |
| 改动：新增 1 测试文件 + 修改 6 源码 | `ls` 实读：6 个源码 mtime 均为 `22:03:42`~`22:06:50`；`tests/increment4-withdraw.test.ts` mtime `22:05:39`；其余 31 套件 mtime ≤ `19:01:19` | ✅ 一致 |
| 无偏差 | 本轮 14 AC + 8 INV 逐条实测，**未发现任何源码偏差** | ✅ 成立 |

> **关于「TaskDetailScreen.tsx mtime（22:06:50）晚于工程师测试文件（22:05:39）」**：工程师在写完测试后对 UI 文件做了最后一次保存。QA 已复跑全量（32/531）并核对该文件源码文本断言（§5-B），内容与断言一致 ⇒ **非隐患**。

---

## 3. 逐条 AC 结果表（AC-01 ~ AC-14）

| AC | 结论 | 证据（原始断言 / 实读位置） |
| --- | --- | --- |
| **AC-01**<br>`task-014` 撤回 ⇒ `withdrawn` + `in_progress` + 清审核态 + 退出待审 | ✅ **PASS** | 种子事实实读：`assigneeId=user-002`(李娜) / `createdBy=user-001`(张伟) / `reviewerIds=['user-001']`（`seed.ts:441/451/454`）。撤回后 `submissionStatus='withdrawn'`、`status='in_progress'`、`reviewRequired=false`、`reviewerIds=[]`、`version+1`；`listPendingReview('user-001')` 不含 `task-014` |
| **AC-02**<br>`createdBy` 但非提报人 ⇒ 40302 且零变化 | ✅ **PASS** | `withdrawCompletion('task-014', {actorId:'user-001'})` ⇒ `code=40302`；`submissionStatus` 仍 `pending`、`version` 不变、`auditFeed` 长度不变 |
| **AC-03**<br>`task-004` 先完成提报再撤回 ⇒ `in_progress` + `completedAt=null` | ✅ **PASS** | `completeTask` ⇒ `done+pending`（`completedAt≠null`）；撤回后 `status='in_progress'`、`completedAt=null`、六字段全清、退出待审队列 |
| **AC-04**<br>陈旧 `version` ⇒ 40901 且状态不变 | ✅ **PASS** | `version-1` ⇒ `code=40901`；任务仍 `done+pending`、`version` 不变 |
| **AC-05**<br>重复撤回 ⇒ 40302（幂等拒绝） | ✅ **PASS** | 第二次（`submissionStatus` 已 `withdrawn`）⇒ `code=40302`（**非 500**）；`version` 与 `auditFeed` 长度均不变 |
| **AC-06**<br>审核通过后不可撤回 | ✅ **PASS** | `reviewSubmission approve` ⇒ `approved + done`；撤回 ⇒ `code=40302`；仍 `approved + done` |
| **AC-07**<br>驳回后不可撤回 | ✅ **PASS** | `reviewSubmission reject` ⇒ `rejected`；撤回 ⇒ `code=40302`；仍 `rejected` |
| **AC-08**<br>非 `pending` 不可撤回（`task-007`） | ✅ **PASS** | `task-007`（`done` + `submissionStatus=undefined`）⇒ `code=40302`；`status`/`version`/`auditFeed` 零变化 |
| **AC-09**<br>零通知 + 写团队动态 | ✅ **PASS** | `JSON.stringify(db.notifications)` **逐字节相等**；`db.auditFeed.length` **+1**、`auditFeed[0].action='submission.withdraw.completion'`、`summary` 含标题、`actorId=提报人` |
| **AC-10**<br>正式任务永不被写成 `cancelled` | ✅ **PASS** | 全量对照：撤回 `task-004`(done 分支) / `task-014` / `task-015`(非 done 分支) 后，`db.tasks` 中 `cancelled` 集合**与撤回前逐 id 相等**；`task-014/015` 的 `status` 保持原值 |
| **AC-11**<br>撤回让任务重新可见于「今日到期」 | ✅ **PASS** | `completeTask('task-004')` 后 `listTodayDue` **不含** `task-004`；撤回后 **含** `task-004`（`withdrawn ≠ pending` ⇒ 重新可见） |
| **AC-12**<br>`tsc` 0 error；既有套件零新增失败 | ✅ **PASS** | `TSC_EXIT=0`；既有 31 套件全绿（套件总数 32 → **33**，用例 531 → **586**）；`submission-flow` / `increment2-*` / `increment3-*` / `round2-regression` 断言**一字未改**（§7） |
| **AC-13**<br>①/② 裁定锚点套件通过且内容未改 | ✅ **PASS** | 逐条实读在位：`increment2-completion.test.ts:98-100`（`shouldClearReviewOnLeaveDone(in_progress+pending,'todo')===false`）、`increment2-qa.test.ts:107-117`（`task-014` 迁往 `todo` 保持 `pending`）、`increment3-qa.test.ts:79`（`dueToday` 精确 5 条）、`:306-316`（K15）、`submission-flow.test.ts:76`（`canTransition('approved','pending')===false`） |
| **AC-14**<br>判据行 / 过滤条件逐条不变 | ✅ **PASS** | 源码文本断言：`shouldClearReviewOnLeaveDone` 仍为 `task.status === 'done' && nextStatus !== 'done' && task.submissionStatus === 'pending'`（**未新增条件**）；`listTodayDue` 的 `status!=='done'` / `submissionStatus!=='pending'` / `!isSubmissionRecord` 三条在位；`listDeadlineApproaching` 的 `done/cancelled` 排除 + 提报记录守卫在位 |

---

## 4. INV 结果表（INV-1 ~ INV-8）

| INV | 结论 | 证据 |
| --- | --- | --- |
| **INV-1**<br>`completedAt != null ⟺ status === 'done'` | ✅ **PASS**（全量遍历） | ① 种子态：遍历 `db.tasks` **零违例**；② 「完成 `task-004`」后零违例；③ 「撤回 `task-004`（done→in_progress）」后零违例且 `completedAt=null`；④ 批量「完成→撤回」`task-004/005/006` 后零违例 |
| **INV-2**<br>徽标 = 分组长度；头部 = 并集基数；`badgeSum ≥ headerUnion` | ✅ **PASS** | 实测 `header === union.size` 且 `badgeSum ≥ header`；口径注释锚点已在 `utils/focus.ts:25-32` 与 `TodayFocusScreen.tsx:108-114` 落位（纯注释，零行为变更） |
| **INV-3**<br>`pending ∧ reviewRequired ∧ reviewerIds∋me ⟺ 在 listPendingReview(me)` | ✅ **PASS** | 撤回前 `task-014/015` 均在队列；撤回 `task-014` 后**仅**它消失，`task-015` 仍在（成员关系，非条数） |
| **INV-4**<br>写操作带 `version`（不匹配 ⇒ 40901）；非法任务迁移 ⇒ 40902 | ✅ **PASS** | 陈旧 `version` ⇒ 40901；`moveTask(task-007 → blocked)` ⇒ 40902（`done → blocked` 非法） |
| **INV-5**<br>正式任务 `status` 永不被撤回写成 `cancelled` | ✅ **PASS** | 同 AC-10 全量对照；`withdrawCompletion` 源码切片**不含** `'cancelled'` |
| **INV-6**<br>撤回零通知（`db.notifications` 前后逐字节相等） | ✅ **PASS** | `done` 分支（`task-004`）与非 `done` 分支（`task-014`）**均**逐字节相等 + 长度不变 |
| **INV-7**<br>审核轮回态（非 `done` + `pending`）的审核态**不被任何迁移清理** | ✅ **PASS** | `shouldClearReviewOnLeaveDone(task-014,'todo')===false`；`moveTask(task-014 → todo)` 后 `submissionStatus` 仍 `pending`、`reviewRequired=true`、`reviewerIds` 非空、**仍在** `listPendingReview`（K3 反向缺陷防护） |
| **INV-8**<br>`submissionStatus` 合法写入集合不变 | ✅ **PASS** | `SUBMISSION_TRANSITIONS` 表内容与 ARCH/PRD 逐键相等；`pending→withdrawn` 合法、`approved` 终态、`withdrawn→draft` 唯一后继；`canTransition('approved','pending')===false` |

---

## 5. 重点攻击结论

### (A) `withdrawCompletion`

| 攻击点 | 实测结果 | 判定 |
| --- | --- | --- |
| **1. 主体双向对照** | 提报人 **李娜（`user-002`，`assigneeId`）→ 撤回成功**（`withdrawn` + `in_progress`）；`createdBy` **张伟（`user-001`）→ `40302`**（`'只能撤回本人提交的完成提报'`）且零副作用。**修正前 `withdrawSubmission` 用 `createdBy` 会恰好反向** | ✅ PASS |
| **2. INV-1 全量遍历** | 遍历 `db.tasks`：种子态 / 完成后 / 撤回后 / 批量完成-撤回后 **均零违例** | ✅ PASS |
| **3. INV-4 六字段全清** | 手工把 `reviewNote` / `reviewedBy` / `reviewedAt` / `reviewerIds` 置为**非空**后再撤回 ⇒ 全部清空（`submissionStatus` 覆写为 `'withdrawn'`）⇒ **证明是「清理」而非「本来就是 null」** | ✅ PASS |
| **4. 幂等 / 重复撤回** | 第二次 ⇒ `40302`；`submissionStatus` 仍 `withdrawn`、`version` 与 `auditFeed` 长度不变 | ✅ PASS |
| **5. 零通知（硬约束）** | `db.notifications` **逐字节相等** + 长度不变（`done` / 非 `done` 两分支各验一次） | ✅ PASS |
| **6. 退出待审队列** | 撤回后 `listPendingReview('user-001')` 不再包含该任务（`task-004` / `task-014` 各验） | ✅ PASS |
| **7. 版本冲突** | 陈旧 `version` ⇒ `40901` 且状态不变 | ✅ PASS |
| **8. 非 `done` 分支** | `task-014`（`in_progress + pending`）撤回后 **`status` 仍为 `in_progress`**（**不落 `todo`**、**不抛 40902**） | ✅ PASS |
| **9. 不得绕过唯一构造点** | 源码切片：`withdrawCompletion` 含 `applyClearedReviewState(`，**不含** `reviewRequired: false` / `reviewerIds: []` / `reviewNote: null`（无第二份手写清单）；`createClearedReviewState()` 全仓**仅一处定义**且返回完整六字段 | ✅ PASS |
| **10. `blocked` 来源** | `task-009`（`blocked`）`completeTask` ⇒ `done` ⇒ 撤回 ⇒ **`in_progress`**（阻塞标记丢失）—— 与 ARCH §10-5 / R5-3 **行为一致**，**不判 FAIL** | ✅ PASS（已登记限制） |
| **附加：校验顺序** | 陈旧 `version` + 错误 actor ⇒ **40901**（version 优先）；非 `pending` + 错误 actor ⇒ 40302（文案 `'仅待审核的完成提报可撤回'`）；`pending` + 错误 actor ⇒ 40302（文案 `'只能撤回本人提交的完成提报'`）⇒ 顺序 = **version → pending → 主体** | ✅ PASS |
| **附加：`task` / `project` 分支主体** | `task-020`（`submissionKind='task'`）主体 = `createdBy`（王强）；`task-019`（`submissionKind='project'`，`assigneeId` 是**拟负责人**陈明）主体**仍为 `createdBy`**（李娜）⇒ 拟负责人**不**被判为提报人 | ✅ PASS |

### (B) `TaskDetailScreen.runTransition` 的 `done` 分支拆分

| 攻击点 | 实测结果 | 判定 |
| --- | --- | --- |
| **1. `todo` 分支逐字节未变** | 源码断言：`body` 含 `taskService.reopenTask` 与 `reason.trim() || '重开任务'`；**行为断言**：`reopenTask(task-004 done → todo)` ⇒ `status='todo'`、`completedAt=null`、`audit[0].action='task.reopen'`、`actorId=createdBy` | ✅ PASS |
| **2. `in_progress` 分支调 `moveTask`** | 源码断言：`done` 分支内 `action.to === 'in_progress'` 子段含 `taskService.moveTask` + `status: 'in_progress'`；**服务层行为断言**：`moveTask(task-004 done → in_progress)` ⇒ `in_progress` + `completedAt=null` + 六字段清 + `audit[0].action='task.move'` | ✅ PASS |
| **3. `requireReason` 未被放宽** | `TASK_TRANSITION_ACTIONS.done` 仍为 2 项（`todo` / `in_progress`）且**两项均 `requireReason: true`**（`types/task.ts` 未改） | ✅ PASS |
| **4. `moveTask` 副作用** | **可观测差异如实登记**：① `audit actorId` 由 `createdBy`（`reopenTask`）变为 `assigneeId ?? createdBy`（`moveTask`）—— 实测 `task-004`：`task.move` 的 actor = 李娜，`task.reopen` 的 actor = 张伟，**二者不同**；② `startedAt ??= now()` —— `startedAt` 为空时被填充，已存在时**保持不变**。**不破坏任何既有断言**（无断言覆盖这两条路径，§7 复核 `grep` 零命中） | ✅ PASS（已登记，非缺陷） |

---

## 6. 回归结果（原始命令输出）

### 6.1 类型检查

```
$ npx tsc --noEmit
TSC_EXIT=0
```

### 6.2 全量测试（QA 交付最终态）

```
$ npx jest --config jest.config.js
Test Suites: 33 passed, 33 total
Tests:       586 passed, 586 total
Snapshots:   0 total
Time:        37.585 s
```

### 6.3 套件 / 用例数演进

| 阶段 | 套件 | 用例 |
| --- | --- | --- |
| 增量 4 开工前基线 | 31 | 502 |
| 工程师交付态 | 32 | 531 |
| **QA 交付态（本轮）** | **33** | **586** |
| QA 新增 | +1（`increment4-qa.test.ts`） | +55 |

### 6.4 QA 新增用例完整通过清单（55 / 55）

```
√ 种子事实核对 ×6（task-014/015/004/007/009/019）
√ 主体错位双向对照 ×2 + 校验顺序 ×3
√ isWithdrawable 分叉主体 ×3（completion / task / project）
√ AC-01 ×2 / AC-03 / AC-05 / AC-08 / AC-09 ×2 / AC-10 ×3 / AC-11
√ AC-06 / AC-07
√ INV-1 全量遍历 ×3
√ INV-3 / INV-7
√ INV-2（徽标 vs 并集）
√ INV-4 / INV-8
√ blocked 来源（task-009）
√ 源码级唯一构造点 / 零通知 / 单一事实来源 ×6
√ AC-14 源码锚点 ×3
√ (B) runTransition 源码断言 ×4
√ (B) 服务层 moveTask / reopenTask / 可观测差异 ×5
√ 撤回入口可见性谓词同源
```

---

## 7. 既有 31 套件零改动核验（mtime + 内容双重证据）

### 7.1 mtime 窗口证据

| 文件 | mtime |
| --- | --- |
| 增量 4 源码施工窗口（6 个改动文件） | `22:03:42` ~ `22:06:50` |
| `tests/increment4-withdraw.test.ts`（工程师新增） | `22:05:39` |
| **31 个既有套件中 mtime 最新者**（`increment3-dedup-notify.test.ts`） | **`19:01:19`** |
| 其余 30 个既有套件 | 全部 ≤ `18:54:54` |

> 既有 31 套件的 mtime **全部早于**增量 4 施工窗口（`22:03` 起）⇒ **无任何既有测试文件在增量 4 期间被写入**。与主理人转述一致（唯一例外 `increment4-withdraw.test.ts` 为**新增**文件）。

### 7.2 内容逐条比对证据（红线断言逐字在位）

| 红线断言 | 位置 | 实读内容 |
| --- | --- | --- |
| `canTransition('approved','pending') === false` | `submission-flow.test.ts:76` | ✅ 在位 |
| `shouldClearReviewOnLeaveDone({status:'in_progress',submissionStatus:'pending'},'todo') === false` | `increment2-completion.test.ts:98-100` | ✅ 在位 |
| `moveTask('task-004',{status:'in_progress'})` ⇒ 六字段全清 + `task.move` | `increment2-completion.test.ts:192-205` | ✅ 在位（与 B3 同路径，仍绿） |
| `task-014` 迁往 `todo` 保持 `pending` + 仍在待审队列 | `increment2-qa.test.ts:107-117` | ✅ 在位 |
| `dueToday` 精确 5 条 | `increment3-qa.test.ts:79` | ✅ 在位 |
| K15 有意差异（`pending` 离开今日到期仍在临期预警） | `increment3-qa.test.ts:306-316` | ✅ 在位 |
| `undoCompletion` 零通知（`JSON.stringify` 快照相等） | `increment3-qa.test.ts:330-342` | ✅ 在位（与撤回零通知同口径参照） |

> **双重证据结论**：既有 31 套件**断言零改动**（mtime 未触 + 红线断言逐字在位 + 全量全绿）。

---

## 8. 问题清单

| # | 级别 | 位置 | 问题 | 证据 | 处置建议 |
| --- | --- | --- | --- | --- | --- |
| **P2-1** | P2 | `tests/increment4-qa.test.ts`（**QA 新文件，非工程师交付物**） | 我最初写的「字段清单字面量全仓唯一」断言过严：`reviewRequired: false` 在 `submission.ts` 合法出现 **2 次**（`UndoReviewReset` 接口类型声明 + `createClearedReviewState()` 实现），断言误期望 `1` | 首跑 `fieldListCount` 实得 `2`，期望 `1` → 1 failed | **已修复**（第 1 轮 QA 自修）：改为「`createClearedReviewState()` 定义唯一 + 其函数体返回完整六字段」+「service 层 `withdrawCompletion` 切片无手写清单」。修复后 55/55 全绿 |
| **P3-1** | P3 | `task.service.ts:143-147` / `:977-985` | `withdrawCompletion` 非 `done` 分支**不改 `status`**，但也不补 `startedAt`（与 `moveTask` 不同） | 实读 + 行为实测：`task-014` 撤回后 `startedAt` 保持原值 | **无需处理**：非 `done` 任务本就已 `startedAt≠null`；不改状态即不触发 `startedAt ??= now()` 属预期。登记备查 |
| **P3-2** | P3 | `TaskDetailScreen.tsx` `done → in_progress` | 改走 `moveTask` 后 **audit `actorId` 口径变化**（`createdBy` → `assigneeId ?? createdBy`） | 实测 `task-004`：`task.move` actor = 李娜 ≠ `task.reopen` actor = 张伟 | **非缺陷**（语义更准确，无断言覆盖）。ARCH §10-12 已登记 |
| **P3-3** | P3 | `TaskDetailScreen.tsx` `done → in_progress` | `moveTask` 对 `in_progress` 目标会 `startedAt ??= now()` | 实测：`startedAt=null` 时被填充；已存在时不变 | **非缺陷**（对已完成过的任务通常无变化）。ARCH §3.5.6 已登记 |
| **P3-4** | P3 | `task.service.ts:914` vs `submission.ts:102-110` | 仓内仍有**两处**撤回主体判定（`withdrawSubmission` 内联 `createdBy` 未收敛） | 源码实读；二者对**提报记录**（非 `completion` 分支）语义等价 | **本次不改**（R5-9 / ARCH §10-9 已登记，避免触碰 `submission-flow.test.ts:240-263`）。建议下一增量随 `M5-P2-04` 一并收敛 |
| **P3-5** | P3 | `utils/submission.ts:19-25` | `SUBMISSION_TRANSITIONS` 仍是**死表**且与真实行为冲突（缺 `approved→pending` / `rejected→pending`） | 全仓 `canTransition` 无运行时调用；`submission-flow.test.ts:76` 锁定 | **本次不改**（K23 已登记，受保护断言锁定）。建议下一增量收口为真守卫 |
| **P3-6** | P3 | `withdrawCompletion` | 撤回**零通知** ⇒ 审核人「待我审核」条目**静默消失** | 实测 `db.notifications` 逐字节相等 | **本次不改**（K24 / R5-6 已登记，与 `undoCompletion` 口径一致）。下一增量候选：`review.withdrawn` 通知 |

> **P0 × 0 / P1 × 0**：未发现任何源码缺陷或阻断项。P2 唯一一条为 **QA 自身新文件的断言 bug**，已在第 1 轮内自修，不构成对工程师交付物的返工要求。

---

## 9. 智能路由判定

### 🟢 **NoOne**（全部通过）

| 判据 | 结果 |
| --- | --- |
| 源码是否有 Bug？ | **无**。B1~B4 四处行为变更 + ①/② 两处口径登记，14 AC / 8 INV 逐条实测通过 |
| 测试代码自身是否有 Bug？ | 有 1 处（**QA 新文件**的过严断言，非工程师交付物），**已在第 1 轮自修** |
| 全量回归 | `tsc` exit 0；**33 套件 / 586 用例全绿**；既有 31 套件断言零改动 |

**结论**：无需将任何问题路由回 **Engineer**。唯一红过的用例属 **QA 侧自修**范畴且已闭环。第 1 轮即收敛，**不进入第 2 轮**（未使用第 2 轮配额）。

> **对工程师交付物的独立结论**：`IS_PASS: YES` 与「无偏差」声明 **经独立实测成立**。两处「最关键改动」（A 主体判定修正、B `done` 分支拆分）经对抗性攻击（双向对照 / 重复撤回 / 零通知 / 非 done 不改 status / 全量 INV-1 / 分支主体 / 校验顺序 / `blocked` 来源）**均未击穿**。

---

## 10. 交付物清单

| # | 交付物 | 类型 | 说明 |
| --- | --- | --- | --- |
| 1 | `docs/mobile-app/QA-mobile-increment-4.md` | **新增** | 本报告 |
| 2 | `apps/mobile/tests/increment4-qa.test.ts` | **新增** | QA 独立验证套件（**55 用例**，独立新文件，未改工程师的 `increment4-withdraw.test.ts`） |

**铁律遵守声明**：

- ✅ **未修改 `src/` 下任何文件**（`git status` / mtime 复核：6 个源码文件 mtime 停留在工程师施工窗口 `22:03`~`22:06`，QA 运行时段未再变动）。
- ✅ **未修改任何既有测试断言**（含 `increment2-*` / `increment3-*` / `round2-regression` / `submission-flow` / `today-focus-gate`），亦**未改**工程师的 `increment4-withdraw.test.ts`。
- ✅ 新用例写在**独立新文件** `tests/increment4-qa.test.ts`。
- ✅ **零新增依赖**；无 `reanimated` / `gesture-handler`；全程使用 `npx`（未用 `pnpm`）。
