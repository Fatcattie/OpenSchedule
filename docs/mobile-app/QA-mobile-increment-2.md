# QA 报告（增量 2）— OpenSchedule 移动端：接通 `completeTask` → 待审核 断链

> 档位：**增量 QA（独立验证）** · QA：严过关（Yan） · 日期：2026-09-27
> 判据：`PRD-mobile-increment-2.md` v1.0 §6（AC-01~AC-13 / INV-1~INV-3 / §6.3 九项回归清单）
> 约定源：`ARCH-mobile-increment-2.md` v1.1 §7（K1~K12）/ §8（测试策略与回归面）
> 被验对象：工程师交付的 5 文件改动 + 1 新测试文件（自评 `IS_PASS: YES`）

---

## 0. 验证环境

| 项 | 值 |
| --- | --- |
| 工作目录 | `d:\GLMclaw\workspace\openschedule\apps\mobile` |
| Node / 包管理 | 复用既有 `node_modules`（未执行任何 install） |
| 测试运行器 | `jest` 29.7.0 + `jest-expo` 57（`npx jest --config jest.config.js`） |
| 类型检查 | `npx tsc --noEmit`（TS 6.0.3，strict） |
| 验证方式 | ① 全量复跑 ② 定向复跑 ③ 源码实读 ④ 检索 ⑤ **QA 独立新增 23 条用例** |
| 源码改动 | **QA 未修改 `src/` 任何文件**（仅新增 2 个测试文件） |

---

## 1. TL;DR 与智能路由判定

**结论：工程师自评 `IS_PASS: YES` 经独立复核成立 —— 13/13 功能 AC、3/3 INV（+INV-4）、9/9 回归清单全部 PASS；未发现 P0/P1/P2 缺陷。**

| 项 | 结果 |
| --- | --- |
| AC 通过率 | **13 / 13 = 100%**（AC-01~AC-13） |
| INV 通过率 | **4 / 4 = 100%**（INV-1~INV-3 + v1.1 的 INV-4） |
| §6.3 回归清单 | **9 / 9 全绿** |
| 工程门槛 | `tsc` exit 0；`jest` **28 套件 / 445 用例全绿**（基线 26/422 + QA 新增 23） |
| 零新增依赖 | ✅ `package.json` 自 2026-09-13 起**未被触碰**（mtime 证据见 §10.4） |
| 既有断言零改动 | ✅ 除 `round2-regression.test.ts:62` 标题外，**无任何既有断言被修改**（mtime + 行号对齐双重证据，见 §10.5） |
| 新增缺陷 | **0 条**（P0/P1/P2）；仅 3 条 P3（已知限制 / 文档口径），**均不阻塞交付** |

### 智能路由判定

```
Engineer  —— 否
QA        —— 否（QA 已自行修复 2 处自有测试缺陷，未外溢）
NoOne     —— ✅ 判定结果：NoOne（全部通过）
```

**判定：`NoOne`。** 源码无 Bug、测试代码无 Bug、工程门槛达标、既有断言零改动。第 1 轮即通过，无需第 2 轮。

---

## 2. 工程门槛（AC-12）

### 2.1 `npx tsc --noEmit`

```
$ npx tsc --noEmit; echo "TSC_EXIT=$?"
TSC_EXIT=0
```

**结论：PASS（exit 0，零 error）。**

### 2.2 `npx jest --config jest.config.js`（全量）

```
Test Suites: 28 passed, 28 total
Tests:       445 passed, 445 total
Snapshots:   0 total
Time:        30.911 s
Ran all test suites.
JEST_EXIT=0
```

**结论：PASS。** 套件数 26→28（+2 = QA 新增），用例数 422→445（+23 = QA 新增）。
工程师自报「26 套件 / 422 用例」**已被独立复现且数值完全一致**（在 QA 追加用例前的原始态，见 §10.2）。

### 2.3 依赖核验（零新增 / 禁 reanimated·gesture-handler）

```
$ grep -rn "reanimated\|gesture-handler" package.json src/
NONE

$ ls -l --time-style=full-iso package.json
-rw-r--r-- 1 Admin 197121 1237 2026-09-13 00:52:43 package.json
```

**结论：PASS。** `package.json` mtime 停在 2026-09-13（早于本增量施工窗口 16:46–16:54 十余天），**本次零依赖变更**；且无 `reanimated` / `gesture-handler`。

---

## 3. 功能验收结果表（AC-01 ~ AC-13）

| AC | 结论 | 证据（用例 / 命令 / 源码） |
| --- | --- | --- |
| **AC-01** | **PASS** | 引擎用例 `completeTask —— 待我审核 断链接通 › 完成任务写入提报态六字段且 source 未被改写`（`task-004`）断言 `status='done'` / `completedAt` 非空 / `submissionStatus='pending'` / `reviewRequired=true` / `reviewerIds` 集合 = `allManagerIds()` / `reviewNote=null` / `version+1` / `audit[0]='task.complete'`；源码 `task.service.ts:337-354` 实读一致（**不改 `source`**，K4） |
| **AC-02** | **PASS** | 引擎用例 `完成后任务进入全部 manager 的「待我审核」队列` 对 `allManagerIds()` **逐个** manager 断言命中；QA 独立用例 `AC-13 · moveTask 由 done 迁往 todo…` 亦对两名 manager 断言 |
| **AC-03** | **PASS** | 引擎用例 `reviewSubmission —— 完成提报通过 / 驳回 › 通过：…` 断言 `approved` / `done` / `completedAt` 非空 / `reviewNote=null` / `review.result` 通知 **+1**；源码 `task.service.ts:938-952` 实读一致 |
| **AC-04** | **PASS** | 引擎用例 `驳回：rejected + in_progress + completedAt 清空 + reviewNote 为原因 + 通知正文含原因`；QA 独立用例（§5.6）补 `'task'` / `'project'` 分支隔离与 42202 无副作用断言；源码 `task.service.ts:975` 由 `resolveApproveBranch==='completion'` 守卫 |
| **AC-05** | **PASS** | 引擎用例 `撤销完成后六字段同时复位且任务完全退出待审队列`；QA 独立用例用 `task-005` 复述（六字段 + `status` 回原值 + 队列不含 + INV-1/INV-3） |
| **AC-06** | **PASS** | 引擎用例 `撤销后可再次完成并重新进入待审队列（AC-06 幂等重入）`；QA 独立用例同结论（`task-005`） |
| **AC-07** | **PASS** | 定向复跑 `npx jest tests/services.test.ts -t "reviewSubmission"` → **2 passed / 24 skipped**（`task-014` approve→`done`；`task-015` reject→`in_progress`+`reviewNote`），原始输出见 §10.1 |
| **AC-08** | **PASS** | `round2-regression.test.ts` 全绿（含 `:73-85` 陈旧 `version`→40901 / 非法目标→40902 两条竞态路径）；`today-focus-gate.test.tsx` 全绿（`visibleTotal` 口径 `共 0 项 / 共 1 项` 未受影响，R4 未动） |
| **AC-09** | **PASS** | 引擎纯函数用例 `resolveReviewItemView —— 分叉视图` 三分支全绿；**QA 新增组件级用例** `increment2-focus-footer.test.tsx`（真实渲染 `TodayFocusScreen`）证明两类条目同屏可区分：完成提报 → 「完成待审」+「李娜 提交了完成提报」；新事项提报 → 「提报待审 · 新任务」+「王强 提报了新任务」 |
| **AC-10** | **PASS** | 引擎用例断言 `reviewerIds` 集合 = `DEMO_MANAGER_IDS`；**QA 全源码检索**：`src/` 内 `reviewerIds` 赋值仅 3 处 —— `task.service.ts:343 = allManagerIds()`（业务唯一写入）、`task.service.ts:718 = []`（新建任务初始）、`utils/submission.ts:130 = []`（清理包）；字面量 `'user-00x'` **仅**存在于 `seed.ts:13-17` 的 `DEMO_USER_IDS` 定义处，**service 层零硬编码**。原始输出见 §10.3 |
| **AC-11** | **PASS** | 引擎用例 `manager（张伟本人）完成任务同样入队，不自审豁免`（`task-006`，`assigneeId===ME`）断言 `reviewerIds` 含 `ME` 且 `listPendingReview(ME)` 命中 |
| **AC-12** | **PASS** | §2 全部门槛通过 |
| **AC-13**（T02b） | **PASS** | 引擎用例 2 条（`reopenTask` / `moveTask`）+ 3 条否决；**QA 独立用例** 4 条：① **守卫时机证明**（顺序敏感布尔式）② `moveTask done→todo`（工程师未覆盖的 `todo` 目标）③ `reopenTask`（`task-006` 独立复述）④ 两条反向否决 + 1 条已知缺口。详见 §5.1 |

---

## 4. INV 不变式结果表

| INV | 结论 | 断言方式与证据 |
| --- | --- | --- |
| **INV-1** `completedAt != null ⟺ status === 'done'` | **PASS** | QA 独立用例 `INV-1：四条写入路径后…均成立`：在 `completeTask` / `reviewSubmission(reject)` / `undoCompletion` / `reopenTask` **四条路径后**分别断言等价关系；并在 AC-04 / AC-13 / K3 各用例中重复断言 |
| **INV-2** `pending ⇒ reviewRequired===true 且 reviewerIds 非空` | **PASS** | QA 独立用例 `INV-2`：`completeTask` 后 + 「撤销审核通过回到 pending」后**两条来源**分别断言 |
| **INV-3** `submissionStatus ∈ {null,'approved','rejected'} ⇒ 不在待审队列` | **PASS** | QA 独立用例 `INV-3`：三条取值用 `task-004/005/006` 分别断言 `listPendingReview` 不含 |
| **INV-4**（v1.1）`离开 done ⇒ submissionStatus !== 'pending'` | **PASS** | 引擎用例 `INV-4：由 done 迁出后不存在 pending 残留（reopen 与 move 两条路径）` + QA 用例 `moveTask done→todo` / `reopenTask` 断言 `submissionStatus===null` |

> 说明：INV-4 由 ARCH v1.1 §7-K5 引入（非 PRD §6.2 原三项），本次一并验证。

---

## 5. 独立验证重点（逐条结论 + 证据）

### 5.1 AC-13 守卫求值时机（**本次最关键**）

**源码实读结论：两处守卫均在改写 `task.status` 之前求值 —— 正确。**

```ts
// task.service.ts:299-302  moveTask
const previous = task.status
// S4（增量 2 · K8）：由 done 迁出且仍待审 ⇒ 清理审核态（守卫读迁移前状态，须在改写 status 前判定）
const clearReviewOnLeaveDone = shouldClearReviewOnLeaveDone(task, input.status)
task.status = input.status            // ← 守卫在此之后才改写
...
if (clearReviewOnLeaveDone) applyClearedReviewState(task)   // :313

// task.service.ts:370-372  reopenTask
const clearReviewOnLeaveDone = shouldClearReviewOnLeaveDone(task, 'todo')
task.status = 'todo'
...
if (clearReviewOnLeaveDone) applyClearedReviewState(task)   // :376
```

**QA 独立设计的「时机证明」用例**（`tests/increment2-qa.test.ts`）：

```ts
// 迁移前（status='done'）→ true；若在 `task.status = next` 之后求值（status 已是 todo）→ false
expect(shouldClearReviewOnLeaveDone({ status: 'done', submissionStatus: 'pending' }, 'todo')).toBe(true)
expect(shouldClearReviewOnLeaveDone({ status: 'todo', submissionStatus: 'pending' }, 'todo')).toBe(false)
```

> **逻辑**：若工程师把守卫写在 `task.status = input.status` 之后，则守卫条件**恒假**、清理永不触发。
> 因此「清理确实发生」这一事实**本身即时机正确的证明**。QA 用 `task-004` 走完整链路（`completeTask` → `moveTask`）
> 断言：`submissionStatus===null`、`reviewRequired===false`、`reviewerIds===[]`、`reviewNote===null`、
> `reviewedBy===null`、`reviewedAt===null`、`completedAt===null`，且**两名 manager** 的 `listPendingReview` 均不含该 id。

**反向验证（非 done 出发不得清理）—— 全部 PASS：**

| 场景 | 守卫条件 | 期望 | 实测 |
| --- | --- | --- | --- |
| `task-001`：`todo → in_progress` | ① 假 | 不清理，且不写入审核态 | `submissionStatus` 仍 `undefined`、`reviewRequired` 仍 `undefined`、不入队 ✅ |
| `task-006`：`in_progress → done` | ② 假（目标为 done） | 不清理，且**不得**自动入队 | `submissionStatus` 仍 `undefined`、不入队 ✅ |
| `task-014`：`in_progress + pending → todo` | ① 假 | 保持 `pending`（ARCH §9.2-P6 已知缺口，本次范围外） | `submissionStatus` 仍 `'pending'`、仍在队列 ✅（**期望行为**，见 §7-P3-1） |

### 5.2 AC-05 / AC-06 撤销「完成」五/六字段同时复位

- **六字段复位**（PRD 五字段 + ARCH P1 补充的 `reviewedBy`/`reviewedAt`）：`submissionStatus=null`、`reviewRequired=false`、`reviewerIds=[]`、`reviewNote=null`、`completedAt=null`、`reviewedBy=null`、`reviewedAt=null`，`status=原状态`，`version+1`，`audit[0]='task.undo'` —— **PASS**（引擎 + QA 双套件，`task-004` / `task-005`）。
- **队列不含该 id**：`listPendingReview(ME)` 断言 `false` —— **PASS**。
- **幂等重入**：撤销后再次 `completeTask` → `submissionStatus='pending'` + 重新入队，**无「已存在待审记录」类错误** —— **PASS**（AC-06）。
- **额外发现（期望行为，非缺陷）**：`undoCompletion` 不传 `submissionStatus`（`undefined`）时提报态**保持 `pending`**、任务**仍在队列**（`task.service.ts:416` 三态语义 + `resolveUndoReviewReset(undefined)===null`）。这是 K2 的**调用方契约**，屏幕侧 `TodayFocusScreen.tsx:256` 对 `kind==='complete'` **已显式传 `null`**，故实际链路无泄漏。QA 已就此新增显式用例固化为契约。

### 5.3 K3 方向性（最易写错处）

**构造用例**：`reviewSubmission('task-014','approve')`（`status='done'`、`submissionStatus='approved'`、`reviewerIds=['user-001']`）
→ `undoCompletion('task-014', { status:'in_progress', submissionStatus:'pending', version })`。

**断言结果（PASS）**：`submissionStatus==='pending'`、**`reviewRequired===true`（未被复位）**、**`reviewerIds===['user-001']`（未被复位）**、`completedAt===null`，
且 **`listPendingReview('user-001')` 仍含 `task-014`** —— 审核人**仍能**在待审队列看到该任务，**未发生「任务从队列消失」的反向缺陷**。

纯函数侧同步验证：`resolveUndoReviewReset('pending') === null`、`resolveUndoReviewReset(undefined) === null`（仅入参 `null` 返回清理包）。

### 5.4 AC-07 回归红线（`tests/services.test.ts:168-184`）

```
$ npx jest --config jest.config.js tests/services.test.ts -t "reviewSubmission" --verbose
  reviewSubmission —— 审核提报
    √ 通过：submissionStatus=approved 且 status=done (246 ms)
    √ 驳回：submissionStatus=rejected 且回到 in_progress + 记录原因 (217 ms)
Test Suites: 1 passed, 1 total
Tests:       24 skipped, 2 passed, 26 total
EXIT=0
```

**结论：PASS。** 红线两条用例逐条一致（`task-014` approve→`done`；`task-015` reject→`in_progress`+`reviewNote`），
且 AC-04 新增的「清空 `completedAt`」**未破坏**该红线（红线为单字段断言，未断言 `completedAt`）。

### 5.5 AC-04（R2）完成提报驳回清空 `completedAt`

| 分支 | 用例 | `status` | `completedAt` | 结论 |
| --- | --- | --- | --- | --- |
| `'completion'` | `task-004` 完成待审 → reject | `in_progress` | **`null`**（本次新增） | PASS |
| `'task'` | `task-020` → reject | `cancelled`（归档，**行为不变**） | `null`（种子本就为 null） | PASS |
| `'project'` | `task-019` → reject | `cancelled`（归档，**行为不变**） | `null` | PASS |

> **证据边界（诚实声明）**：非 `completion` 分支的种子任务 `completedAt` 本就为 `null`，无法用「数值」区分
> 「未被清」与「被清为 null」。故该分支的「行为不变」由**两项证据**共同支撑：① `status` 差异（`cancelled` vs `in_progress`）；
> ② 源码实读 `task.service.ts:975` —— 清空语句被 `resolveApproveBranch(task) === 'completion'` 严格守卫。

### 5.6 AC-10（K6）`reviewerIds` 唯一来源 `allManagerIds()`，无硬编码

```
$ grep -rn "reviewerIds\s*[:=]" src/
src/data/seed.ts:454,476,551,573,595,625,650   reviewerIds: [DEMO_USER_IDS...]   ← 种子数据（非业务代码）
src/utils/submission.ts:114                     reviewerIds: string[]             ← 类型声明
src/utils/submission.ts:130                     reviewerIds: [],                  ← 清理包
src/services/task.service.ts:343                task.reviewerIds = allManagerIds() ← 业务唯一写入
src/services/task.service.ts:718                reviewerIds: [],                  ← 新建任务初始值
src/services/task.service.ts:760                reviewerIds: string[],            ← 函数形参

$ grep -rn "'user-00" src/
src/data/seed.ts:13   me: 'user-001',
src/data/seed.ts:14   lina: 'user-002',
src/data/seed.ts:15   wangqiang: 'user-003',
src/data/seed.ts:17   manager: 'user-004',
```

**结论：PASS。** 字面量 id **仅**出现在 `seed.ts` 的 `DEMO_USER_IDS` 定义处（种子数据，非业务代码）；
**service 层唯一写入点** = `task.service.ts:343` 的 `allManagerIds()`；`allManagerIds()`（`data/index.ts:179`）每次返回**新数组**，可安全赋值。

### 5.7 AC-12 工程门槛

见 §2。**PASS。**

### 5.8 既有断言零改动核验

`apps/mobile/` 在整个仓库中**未被 git 跟踪**（`git ls-files apps/mobile` 返回 0 条，`git status` 显示 `?? apps/mobile/`），
**`git diff` 不可用**。改用**两重独立证据**：

**证据 A —— 文件 mtime（本增量施工窗口 = 2026-09-27 16:46–16:54）**

```
2026-09-27 10:38:23.946711000 tests/react-test-renderer.d.ts   ← 25 套既有测试文件中 mtime 最新者
2026-09-27 16:50:29.780723300 tests/increment2-completion.test.ts   ← 新增
2026-09-27 16:52:56.447256100 tests/round2-regression.test.ts       ← 仅此 1 个既有文件被动过
```

除 `round2-regression.test.ts` 外，**全部 25 个既有测试文件 mtime 均 ≤ 10:38**，远早于施工窗口 ⇒ 物理上不可能被本次改动触碰。

**证据 B —— 行号对齐（行数未增删）**

PRD §6.3 引用的行号与实际文件**逐一对齐**：`:19-31`、`:33-41`、`:43-60`、`:62-69`、`:73-85` 与
`round2-regression.test.ts` 中 5 个 `it(...)` 块完全对应。若标题之外增删任何行，后续行号必然错位 ⇒ **仅标题字符串被替换**。

**证据 C —— 断言语义比对（PRD §6.3 引用 vs 实际）**

| 行号 | PRD §6.3 引用的断言语义 | 实际断言 | 一致 |
| --- | --- | --- | --- |
| `:19-31` | 撤销完成回 `in_progress`、`completedAt===null` | `status==='in_progress'` / `completedAt` null / `version+1` / `audit[0]==='task.undo'` | ✅ |
| `:33-41` | 撤销完成回 `todo` | `status==='todo'` / `completedAt` null | ✅ |
| `:43-60` | 撤销审核通过 → `pending` + `completedAt===null` | 同上（传 `submissionStatus:'pending'`） | ✅ |
| `:62-69` | 「不传 `submissionStatus` 时保持原值」 | `expect(undone.submissionStatus).toBe(before?.submissionStatus)` | ✅（**仅标题由「不传 submissionStatus 时保持原值不动」改为 ARCH T06 建议的措辞**） |
| `:73-85` | 陈旧 `version`→40901；非法目标→40902 | `rejects.toMatchObject({ code: ERR_OPTIMISTIC_LOCK / ERR_ILLEGAL_TRANSITION })` | ✅ |

**结论：PASS。** 除 `round2-regression.test.ts:62` 的**用例标题**外，**无任何既有断言被修改** —— 与工程师自报一致。

### 5.9 纯函数字段清单核验

```ts
// src/utils/submission.ts:126-135
export function createClearedReviewState(): UndoReviewReset {
  return { submissionStatus: null, reviewRequired: false, reviewerIds: [],
           reviewNote: null, reviewedBy: null, reviewedAt: null }   // 6 字段，与 ARCH §3.3 一致
}

// :145-148
export function resolveUndoReviewReset(next: Task['submissionStatus']): UndoReviewReset | null {
  if (next !== null) return null          // undefined / 'pending' / 'approved' / … 一律返回 null
  return createClearedReviewState()
}
```

| 断言 | 结果 |
| --- | --- |
| `createClearedReviewState()` 返回**恰好 6 字段**且全清 | PASS（QA 复述 `Object.keys` 集合断言） |
| **每次返回新对象**（`a !== b`）且 `reviewerIds` 为独立数组 | PASS |
| `resolveUndoReviewReset(null)` 返回清理包，且 `toEqual(createClearedReviewState())` | PASS |
| `resolveUndoReviewReset(undefined)` / `('pending')` 返回**假值**（`null`） | PASS |
| `resolveUndoReviewReset('approved'/'rejected'/'withdrawn'/'draft')` 亦返回 `null` | PASS（引擎 `it.each` 全分支） |

### 5.10 边界与异常

| 场景 | 期望 | 实测 | 结论 |
| --- | --- | --- | --- |
| 陈旧 `version` → `moveTask` | 40901，且**不触发清理** | `rejects.toMatchObject({code:40901})`；任务仍 `done`+`pending`、`version` 未变 | PASS |
| 陈旧 `version` → `reopenTask` | 40901，且**不触发清理** | 同上 | PASS |
| 非法目标状态（`done → cancelled`） | 40902 | `ERR_ILLEGAL_TRANSITION` | PASS |
| 驳回原因 < 4 字（`'说明不'` / `'   '` / `'ab'`） | 42202，且**任务未被部分修改** | `ERR_SUBMISSION_INVALID`；三次失败后 `status='done'`、`submissionStatus='pending'`、`completedAt` 非空、`reviewNote=null`、`version` 未变、仍在队列 | PASS |

> 源码佐证：`task.service.ts:968-970` 的原因校验**先于**任何写入（`:971` 起才改字段），故失败路径**零副作用**。

### 5.11 UI 承载面（K9）

**源码实读**：`TaskCard.footer` 全源码**仅 1 处传参** —— `TodayFocusScreen.tsx:475`，且位于
`reviewView = tab === 'review' && canReview ? resolveReviewItemView(task) : null`（`:463`）的守卫之内。

**组件级实测**（QA 新增 `tests/increment2-focus-footer.test.tsx`，真实渲染 `TodayFocusScreen`）：

| 用例 | 结果 |
| --- | --- |
| `due` 分组：即使任务带 `pending` 审核态，也不渲染「完成待审」/「提交了完成提报」 | PASS |
| `approaching` 分组：同样不渲染 footer | PASS |
| `review` 分组：完成提报 → 「完成待审」+「李娜 提交了完成提报」；新事项提报 → 「提报待审 · 新任务」+「王强 提报了新任务」 | PASS |
| `member` 角色：`review` 分组不可见 ⇒ 分叉标签不泄露 | PASS |

> **可测性说明**：原「不可测」判断不成立 —— 既有 `today-focus-gate.test.tsx` 已建立「真实渲染 + mock service/hooks」
> 的组件测试姿势，QA 复用该姿势即可覆盖 K9，无需新增依赖（`react-test-renderer` 已在 devDependencies）。

### 5.12 补充：第三方「离开 done」路径穷举（独立复核 ARCH §9.2-P6）

```
$ grep -rn "\.status = '" src/ | grep -v personal
src/services/focus.service.ts:355   task.status = 'done'      ← db.personalTasks（个人任务，不同集合，不适用）
src/services/task.service.ts:279    claimTask    → in_progress （UI 不可达：3 处调用点均要求 status==='todo'）
src/services/task.service.ts:337    completeTask → done        （迁往 done，不离开）
src/services/task.service.ts:372    reopenTask   → todo        ✅ 已守卫
src/services/task.service.ts:839    landSubmissionRecord → cancelled（提报归档）
src/services/task.service.ts:906    withdrawSubmission → cancelled（自身置 'withdrawn'，非泄漏）
src/services/task.service.ts:941    reviewSubmission(approve) → done（迁往 done）
+  task.service.ts:302  moveTask    = input.status            ✅ 已守卫
+  task.service.ts:414  undoCompletion = input.status         ✅ 已守卫（null 时清理）
+  task.service.ts:973  reviewSubmission(reject)              （自身置 'rejected'，非泄漏）
```

**结论：无第三种泄漏型「离开 `done`」路径**，与 ARCH §9.2-P6 的穷举一致。

---

## 6. 回归结果（PRD §6.3 九项 + ARCH §8.1b）

| # | 文件 : 位置 | 断言内容 | 结论 |
| --- | --- | --- | --- |
| 1 | `tests/services.test.ts:168-184` | `task-014` approve→`done`；`task-015` reject→`in_progress`+`reviewNote` | **PASS**（定向复跑，§10.1） |
| 2 | `tests/services.test.ts:122-135` | `completeTask('task-004')` → `status`/`actualHours`/`completedAt` | **PASS**（单字段附加断言不受影响） |
| 3 | `tests/round2-regression.test.ts:19-31` | 撤销完成回 `in_progress`，`completedAt===null` | **PASS** |
| 4 | `tests/round2-regression.test.ts:33-41` | 撤销完成回 `todo` | **PASS** |
| 5 | `tests/round2-regression.test.ts:43-60` | 撤销审核通过 → `pending` + `completedAt===null`（须遵守 K3） | **PASS** |
| 6 | `tests/round2-regression.test.ts:62-69` | 不传 `submissionStatus` 保持原值（仅标题改名） | **PASS** |
| 7 | `tests/round2-regression.test.ts:73-85` | 陈旧 `version`→40901；非法目标→40902 | **PASS** |
| 8 | `tests/today-focus-gate.test.tsx:205/219` | `共 0 项 / 共 1 项待处理`（`visibleTotal` 口径，R4 未动） | **PASS** |
| 9 | `tests/seed-integrity.test.ts` | 种子完整性（本次不改种子） | **PASS** |
| 10 | `tests/services.test.ts:93-110` | `moveTask('task-006',done)` 合法；`moveTask('task-007',cancelled)` 40902 | **PASS** |
| 11 | `tests/services.test.ts:139-143` | `reopenTask('task-007')` → `todo` + `completedAt===null` | **PASS** |
| 12 | `tests/task-state-machine.test.ts:40-56` | `done → todo/in_progress` 合法；`done → cancelled/blocked` 非法 | **PASS** |
| 13 | `tests/submission-flow.test.ts:243-261` | `withdrawSubmission` 越权 40302 / 撤回成功 | **PASS** |
| 14 | 种子 `task-014/015` | `in_progress`+`pending`：守卫①假 ⇒ 行为不变 | **PASS** |
| 15 | 种子 `task-019~023` | 均 `cancelled`，不受 6 字段清理包扩项影响 | **PASS** |

**回归结论：15/15 全绿，零回归。**

---

## 7. 问题清单

> 严重度定义：P0 阻塞交付 / P1 功能缺陷 / P2 体验或一致性缺陷 / P3 已知限制或文档口径。

**本次未发现 P0 / P1 / P2 缺陷。** 以下 3 条为 P3（**均已在 PRD/ARCH 中显式登记，不阻塞交付**）。

| # | 严重度 | 问题 | 说明与证据 | 处置 |
| --- | --- | --- | --- | --- |
| **1** | **P3** | 种子 `task-014` / `task-015`（`in_progress` + `pending`，**非由 `done` 迁出**）经 `moveTask` 离开当前状态时**不清理** `pending` | QA 用例 `种子 task-014…迁往 todo ⇒ 保持 pending` **实测确认**：`submissionStatus` 仍 `'pending'`、仍在队列。守卫①要求 `status==='done'` ⇒ 本次不覆盖 | **本次范围外**（ARCH §9.2-P6-③ 已登记为既有缺口，建议后续增量放宽守卫①）。**非本次引入** |
| **2** | **P3** | 「今日到期 / 待我审核」**双计**（`visibleTotal` 重复计数） | 既存问题（种子 `task-014` 已如此）；本增量接通后**放大**。`today-focus-gate.test.tsx:205/219` 断言未受影响（实测全绿） | **本次明确不处理**（PRD §8-2 / Q3-5 裁定）。属范围铁律 |
| **3** | **P3** | `ARCH-mobile-increment-2.md` §3.4 称 `TaskCard` 有「既有 5 处调用点」，实际 `<TaskCard` 调用点为 **3 处**（`BoardScreen.tsx:197` / `TodayFocusScreen.tsx:470` / `WorkspaceScreen.tsx:352`） | `grep -rn "<TaskCard" src/` 实测 3 处 | **纯文档口径偏差**，不影响 `footer` 可选 prop 的零回归结论（3 处调用点均未传 `footer`）。建议工程师在文档中更正数字 |

**工程师自评复核结论**：

| 自评项 | 独立复核 |
| --- | --- |
| `IS_PASS: YES` | ✅ 成立 |
| `npx tsc --noEmit` exit 0 | ✅ 复现 |
| `npx jest` 26 套件 / 422 用例全绿 | ✅ 复现（QA 追加用例前的原始态，见 §10.2） |
| 零新增依赖 | ✅ 复现（`package.json` mtime 未变 + 无禁用依赖） |
| 仅改 `round2-regression.test.ts:62` 标题 | ✅ 复现（mtime + 行号对齐 + 断言语义比对） |
| 改动文件清单 6 个 | ✅ 完全一致（`src/` 施工窗口内改动恰为 4 文件） |

---

## 8. QA 新增测试

> 约束遵守：**未修改任何既有套件的断言**（K11）；**未修改 `src/` 任何文件**。

| 文件 | 用例数 | 覆盖缺口 |
| --- | --- | --- |
| `apps/mobile/tests/increment2-qa.test.ts`（**新增**） | **19** | ① AC-13 守卫**时机**显式证明；② AC-13 反向否决（`todo→in_progress`、`in_progress→done`、种子 `task-014` 边界）；③ `moveTask done→todo`（工程师只测了 `in_progress` 目标）；④ `reopenTask` 用 `task-006` 独立复述；⑤ AC-05/AC-06 用 `task-005` 独立复述；⑥ 三态 `undefined` 的调用方契约固化；⑦ INV-1（四路径）/ INV-2（两来源）/ INV-3（三取值）逐条断言；⑧ AC-04 三分支隔离（含 `'task'` / `'project'`）；⑨ 边界异常：40901 且**无副作用**、40902、42202 且**无部分修改** |
| `apps/mobile/tests/increment2-focus-footer.test.tsx`（**新增**） | **4** | K9 组件级承载面（`due` / `approaching` 不传 `footer`）+ AC-09 两类条目同屏可区分 + member 角色不泄露分叉标签 |
| **合计** | **23** | 全量用例数 422 → **445** |

**QA 自查**：新增用例初次运行暴露 **2 处 QA 自身缺陷**（`INV-3` 用例对同一任务重复 `completeTask` 触发 40902；组件用例的任务标题 `待审核：…` 与状态标签 `已完成` 拼接后误命中 `完成待审`）。**均由 QA 自行修正，未外溢至源码，也未修改任何既有断言。**

---

## 9. 智能路由判定

```
┌─────────────────────────────────────────────────────────────┐
│  轮次：第 1 轮（共 2 轮上限）                                │
│                                                             │
│  源码 Bug（Engineer）      : 无                              │
│  测试代码 Bug（QA）        : 无（QA 自有 2 处缺陷已自修）    │
│  工程门槛                  : tsc exit 0 / jest 28套445例全绿 │
│  既有断言改动              : 仅 1 处标题（已授权，断言未动）  │
│                                                             │
│  ▶ 智能路由判定 = NoOne（全部通过，无需下一轮）              │
└─────────────────────────────────────────────────────────────┘
```

**判定：`NoOne`。** 无需进入第 2 轮。

---

## 10. 证据附录（原始命令输出）

### 10.1 AC-07 定向复跑（`services.test.ts -t reviewSubmission`）

```
  reviewSubmission —— 审核提报
    √ 通过：submissionStatus=approved 且 status=done (246 ms)
    √ 驳回：submissionStatus=rejected 且回到 in_progress + 记录原因 (217 ms)

Test Suites: 1 passed, 1 total
Tests:       24 skipped, 2 passed, 26 total
Snapshots:   0 total
Time:        5.107 s
EXIT=0
```

### 10.2 全量 jest（QA 追加用例前 = 工程师交付态）

```
Test Suites: 26 passed, 26 total
Tests:       422 passed, 422 total
Snapshots:   0 total
Time:        27.704 s
Ran all test suites.
JEST_EXIT=0
```

### 10.3 硬编码 id / reviewerIds 检索

```
$ grep -rn "reviewerIds\s*[:=]" src/
src/data/seed.ts:454:    reviewerIds: [DEMO_USER_IDS.me],
src/data/seed.ts:476:    reviewerIds: [DEMO_USER_IDS.me],
src/data/seed.ts:551:    reviewerIds: [DEMO_USER_IDS.me, DEMO_USER_IDS.manager],
src/data/seed.ts:573:    reviewerIds: [DEMO_USER_IDS.me, DEMO_USER_IDS.manager],
src/data/seed.ts:595:    reviewerIds: [DEMO_USER_IDS.me],
src/data/seed.ts:625:    reviewerIds: [DEMO_USER_IDS.me, DEMO_USER_IDS.manager],
src/data/seed.ts:650:    reviewerIds: [DEMO_USER_IDS.me, DEMO_USER_IDS.manager],
src/utils/submission.ts:114:  reviewerIds: string[]
src/utils/submission.ts:130:    reviewerIds: [],
src/services/task.service.ts:343:    task.reviewerIds = allManagerIds()
src/services/task.service.ts:718:    reviewerIds: [],
src/services/task.service.ts:760:  reviewerIds: string[],

$ grep -rn "'user-00" src/
src/data/seed.ts:13:  me: 'user-001',
src/data/seed.ts:14:  lina: 'user-002',
src/data/seed.ts:15:  wangqiang: 'user-003',
src/data/seed.ts:17:  manager: 'user-004',

$ grep -rn "reanimated\|gesture-handler" package.json src/
NONE
```

### 10.4 依赖与改动范围

```
$ ls -l --time-style=full-iso package.json
-rw-r--r-- 1 Admin 197121 1237 2026-09-13 00:52:43.415627000 +0800 package.json

$ (施工窗口内 src/ 改动文件)
2026-09-27 16:46:22.828150900 src/utils/submission.ts
2026-09-27 16:47:52.850578100 src/services/task.service.ts
2026-09-27 16:52:03.645054700 src/screens/TodayFocusScreen.tsx
2026-09-27 16:54:44.571890100 src/components/TaskCard.tsx

$ grep -rn "footer=" src/
src/screens/TodayFocusScreen.tsx:475:                      footer={

$ grep -rn "<TaskCard" src/
src/screens/BoardScreen.tsx:197
src/screens/TodayFocusScreen.tsx:470
src/screens/WorkspaceScreen.tsx:352
```

### 10.5 既有测试文件 mtime（证明仅 `round2-regression.test.ts` 被动过）

```
2026-09-27 10:38:23.946711000 tests/react-test-renderer.d.ts          ← 既有文件中最新
2026-09-27 10:36:36.912287500 tests/project-list-fab.test.tsx
2026-09-27 10:35:29.910936000 tests/today-focus-gate.test.tsx
2026-09-27 10:13:09.905318800 tests/seed-submissions.test.ts
2026-09-27 10:12:02.928499300 tests/draft-persist.test.tsx
2026-09-27 10:11:02.597350600 tests/screen-gate.test.tsx
2026-09-27 10:09:37.774724600 tests/permission-hook.test.tsx
2026-09-27 10:08:58.290449700 tests/personal-plan.test.ts
2026-09-27 09:16:28.059030300 tests/submission-flow.test.ts
2026-09-13 01:11:14.733780600 tests/services.test.ts                  ← 红线文件：自初版起未动
...
2026-09-27 16:50:29.780723300 tests/increment2-completion.test.ts     ← 新增（工程师）
2026-09-27 16:52:56.447256100 tests/round2-regression.test.ts         ← 仅此 1 个既有文件
2026-09-27 17:02:39.021115900 tests/increment2-qa.test.ts             ← 新增（QA）
2026-09-27 17:03:30.723748100 tests/increment2-focus-footer.test.tsx  ← 新增（QA）
```

### 10.6 QA 新增套件运行输出

```
$ npx jest --config jest.config.js tests/increment2-qa.test.ts --verbose
  AC-13 —— 守卫求值时机（独立设计的时机证明）
    √ 守卫是「顺序敏感」的：status 已被改写后再求值会恒假 —— 故「清理发生」本身即时机证据
    √ moveTask 由 done 迁往 todo ⇒ 六字段全清且退出待审队列（engineer 只测了 in_progress 目标）
    √ reopenTask 由 done 迁出 ⇒ 六字段全清且退出待审队列（用 task-006 独立复述）
  AC-13 反向 —— 非「由 done 迁出」不得触发清理
    √ todo → in_progress（守卫①假）不清理、也不写入审核态
    √ in_progress → done（守卫②假：目标为 done）不得清理、也不得自动入队
    √ 种子 task-014（in_progress + pending，非由 done 迁出）迁往 todo ⇒ 保持 pending（ARCH §9.2-P6 已知缺口，期望行为）
  AC-05 / AC-06 —— 撤销完成（用 task-005 独立复述）
    √ AC-05：六字段同时复位、status 回原值、退出待审队列、INV-1/INV-3 成立
    √ AC-06：撤销后可再次完成并重新入队（幂等重入，无「已存在待审记录」错误）
    √ 三态之 undefined：撤销时不传 submissionStatus ⇒ 提报态保持 pending（K2 调用方契约，屏幕侧必须显式传 null）
  K3 方向性 —— 撤销「审核通过」禁止复位审核态（否则任务从待审队列消失）
    √ 撤销审核通过（传 pending）后 reviewRequired / reviewerIds 保持，审核人仍能在 listPendingReview 看到该任务
  INV 不变式逐条断言
    √ INV-1：四条写入路径后 `completedAt != null ⟺ status === done` 均成立
    √ INV-2：`submissionStatus === pending ⇒ reviewRequired === true 且 reviewerIds 非空`
    √ INV-3：submissionStatus ∈ {null, approved, rejected} ⇒ 不在待审队列
  AC-04 —— 分支隔离：仅 completion 分支清 completedAt
    √ completion 分支：reject ⇒ in_progress + completedAt === null
    √ 'task' 分支：reject ⇒ status='cancelled'（归档），不落 in_progress（行为不变）
    √ 'project' 分支：reject ⇒ status='cancelled'（归档），行为不变
  边界与异常码 —— 本次改动未破坏
    √ 陈旧 version ⇒ 40901，且不触发任何审核态清理（moveTask / reopenTask）
    √ 非法目标状态 ⇒ 40902（moveTask done→cancelled）
    √ 驳回原因 < 4 字 ⇒ 42202，且任务未被部分修改（completion 分支）

Test Suites: 1 passed, 1 total
Tests:       19 passed, 19 total
EXIT=0

$ npx jest --config jest.config.js tests/increment2-focus-footer.test.tsx --verbose
  K9 —— footer 只出现在「待我审核」分组
    √ due 分组：即使任务带 pending 审核态，也不渲染「完成待审」标签与提交人副文案
    √ approaching 分组：同样不渲染 footer
  AC-09 —— review 分组两类条目可区分
    √ 两类条目同屏：完成提报显示「完成待审 + 李娜 提交了完成提报」；新事项提报显示「提报待审 · 新任务 + 王强 提报了新任务」
    √ member 角色：review 分组不可见 ⇒ 分叉标签不泄露

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
EXIT=0
```

---

## 11. 结论

- 工程师交付的「`completeTask` → 待审核 断链」**功能正确、回归干净、门槛达标**；其 `IS_PASS: YES` 自评**经独立复核成立**。
- 最易写错的 **AC-13 守卫求值时机** 与 **K3 方向性** 两处，**实现正确**（前者由 QA 的「顺序敏感布尔式」用例显式证明；后者由「撤销审核通过后审核人仍在队列看到任务」用例证明）。
- 发现 3 条 **P3**（2 条为 PRD/ARCH 已登记的已知限制，1 条为文档口径偏差），**均不阻塞交付**。
- **智能路由判定：`NoOne`** —— 全部通过，无需第 2 轮。

---

## 12. 修订记录

| 版本 | 日期 | 修订内容 |
| --- | --- | --- |
| **v1.0** | 2026-09-27 | 增量 2 首版 QA 报告：§0 验证环境；§1 TL;DR + 判定 `NoOne`；§2 工程门槛（tsc exit 0 / 28 套件 445 用例全绿 / 零新增依赖）；§3 AC-01~AC-13 逐条结果表（13/13 PASS）；§4 INV-1~INV-4（4/4 PASS）；§5 独立验证重点 12 项（AC-13 时机、AC-05/06、K3、AC-07、AC-04、AC-10 检索、AC-12、既有断言零改动、纯函数字段清单、边界异常、K9 UI 承载面、离开 done 路径穷举）；§6 回归 15/15；§7 问题清单（P0/P1/P2 = 0，P3 = 3）；§8 QA 新增 2 文件 23 用例；§9 智能路由判定；§10 原始命令输出附录；§11 结论 |
