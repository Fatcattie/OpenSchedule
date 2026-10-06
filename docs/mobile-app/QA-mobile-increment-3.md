# QA 报告（增量 3）— OpenSchedule 移动端：双计去重 + 「待你审核」站内通知

> 验证人：严过关（QA） · 日期：2026-09-27 · 轮次：**第 1~2 轮（第 1 轮独立验证 + 第 2 轮 QA 自修）**
> 判据：`PRD-mobile-increment-3.md` §6（AC-01~AC-12 / INV-5~INV-9）· `ARCH-mobile-increment-3.md` §7（K13~K18）/ §8 / §9
> 被验对象：工程师自评 `IS_PASS: YES` 的增量 3 实现（5 改 + 1 新增源码文件 + 1 新增测试文件）

---

## 0. TL;DR

| 项 | 结论 |
| --- | --- |
| **源码正确性** | ✅ **零缺陷**。5 个改动点（`listTodayDue` 两条排除、`countVisibleFocusTasks` 并集口径、`pushNotificationOnce`、`completeTask` 派发、三处映射同步）**全部按 ARCH 落地**，行为与文档逐条一致 |
| **AC 通过率** | **12 / 12 = 100%**（AC-01~AC-12 全 PASS） |
| **INV 通过率** | **5 / 5 = 100%**（INV-5~INV-9 全 PASS） |
| **回归** | ✅ `npx tsc --noEmit` → **exit 0**；`npx jest --config jest.config.js` → **31 套件 / 502 用例全绿**（基线 28 / 445；工程师交付态 29 / 476） |
| **既有断言零改动** | ✅ **28 个既有套件 100% 未被触碰**（mtime ≤ `17:03:30`，增量 3 施工窗口为 `18:26`~`18:33`）；5 处红线断言逐字在位 |
| **偏差-1（`task-001` 前提不可行）独立复核** | ✅ **工程师判断成立**。`TASK_TRANSITIONS.todo` 不含 `'done'`；`task-001` 种子 `status='todo'`；实测 `completeTask('task-001')` 抛 **40902**。改用 `task-004` 是**正确处置**，AC-04 语义完整保留，**不判 FAIL** |
| **问题清单** | P0 × 0、P1 × 0、**P2 × 1 → 已修复**（工程师新增测试文件的 2 处时刻相关断言，第 2 轮由 QA 自修完毕）、P3 × 3（观察/建议项） |
| **智能路由判定（最终）** | 🟢 **NoOne** —— 源码零缺陷 + 测试缺陷（2 处时刻相关断言）已由 QA 在第 2 轮**自修完毕** + 全绿（31 / 502）。<br>〔第 1 轮结论 **🟡 QA**，已被第 2 轮取代，详见 §11 / §13〕 |

**一句话**：**实现是对的，可以验收**；唯一曾需返工的是**工程师新增测试文件里 2 条「时刻相关」的断言**（`toBe(10)` / `toContain('task-014')`）—— 属**测试代码 Bug**（非实现缺陷），**已由 QA 在第 2 轮自修完毕**（详见 §13）。

---

## 1. 验证环境

| 项 | 值 |
| --- | --- |
| 工作目录 | `d:\GLMclaw\workspace\openschedule\apps\mobile` |
| 运行时刻 | 2026-09-27 18:35 ~ 18:57（Asia/Shanghai） |
| 运行时 | Expo 57 / RN 0.86.3 / React 19.2.3 / TS 6.0.3 / Jest 29.7（`jest-expo` preset） |
| 命令 | `npx tsc --noEmit` · `npx jest --config jest.config.js` |
| 数据态 | 每个用例 `beforeEach(() => resetDatabase())`（内存库复位到种子） |
| 源码改动 | **QA 未修改 `src/` 下任何文件**（铁律遵守）；仅新增 2 个测试文件 |

---

## 2. 偏差-1 独立复核（**结论：工程师判断成立**）

### 2.1 复核方法：实读源码 + 行为级实证（不采信任何一方陈述）

| # | 判据 | 实读位置 | 事实 |
| --- | --- | --- | --- |
| 1 | 迁移表 | `src/types/task.ts:106-112` | `TASK_TRANSITIONS.todo = ['in_progress', 'blocked', 'cancelled']` ⇒ **`todo → done` 不是合法迁移** |
| 2 | 服务守卫 | `src/services/task.service.ts:332-338` | `completeTask` 首两守卫 = `assertVersion` → **`assertTransition(task.status, 'done')`** ⇒ 对 `todo` **第一步即抛 40902** |
| 3 | 种子状态 | `src/data/seed.ts:202-206` | `task-001`（「需求文档评审」）`status: 'todo'` |
| 4 | 替代样本合法性 | `src/data/seed.ts:253-260` | `task-004`（「首页原型设计」）`status: 'in_progress'`、`dueAt = demoDayAt(0, 20, 0)`（今天） |
| 5 | UI 一致性 | `src/screens/TodayFocusScreen.tsx` | `todo` 条目给「承接」（`claimTask`），仅 `in_progress`/`blocked` 给「完成」（`completeTask`）⇒ 与状态机一致 |

**行为级实证（我新增的 QA 用例，原始输出见 §8.4）**：

```
√ task-001 种子状态为 todo，completeTask 抛 40902（todo → done 非法迁移）
√ task-004（in_progress）可合法完成，AC-04 语义在替代任务上完整成立
```

### 2.2 复核结论

> **工程师「偏差-1」的判断成立，且处置正确。**
>
> - PRD AC-04 的原始 Given（`status='todo'` 的 `task-001` → `completeTask`）**物理不可行**（`todo → done` 非法，实测 40902）—— 这是**文档事实性错误**，不是实现缺陷。
> - 工程师在**测试侧**改用 `task-004`（`in_progress` + `dueAt` 今天 + 标题「首页原型设计」），撤销目标状态 `'in_progress'`，**AC-04 的语义（dueAt 为今天的可完成任务完成后离开「今日到期」并进入「待审」）完整保留**；**生产代码零迁就性改动**（`TASK_TRANSITIONS` / `completeTask` 均未动）。
> - 文档侧**确已修正**：`PRD-mobile-increment-3.md` 已升 v1.1（AC-04 改 `task-004`、AC-05 去硬编码、§6.1 新增「AC-04 产品语义说明」）；`ARCH-mobile-increment-3.md` 已升 v1.1（新增 §3.5.1a「完成态样本选取」+ §9 第 10~13 条偏差登记）。**故此项不判 FAIL。**

---

## 3. 逐条 AC 结果表（AC-01 ~ AC-12）

| AC | 结论 | 证据（原始命令 / 断言 / 实读位置） |
| --- | --- | --- |
| **AC-01**<br>`listTodayDue` = 5 条且不含 `done` / `pending` | ✅ **PASS** | 独立复算（§6）：`dueToday = ["task-001","task-004","task-005","task-016","task-017"]`，与 AC-01 期望**逐 id 相等**；消失清单**仅** `task-014` / `task-015`。源码 `task.service.ts:176-178` 两条新条件在位 |
| **AC-02**<br>头部 = 10；徽标 5 / 4 / 6 | ✅ **PASS** | 实测 `union = 10`，`naive sum = 15`（§6）；`TodayFocusScreen.tsx:141` = `countVisibleFocusTasks(focus.data, { includeReview: canReview })`；徽标仍取 `counts[tab]`（`:108-115`，未改，K13）。⚠️ 时刻相关性见 §10-P3-1 |
| **AC-03**<br>`due ∩ review = ∅`；`task-014/015` 只在 review | ✅ **PASS** | QA 用例断言 `reviewIds.filter(id => dueIds.has(id)) === []`；`task-014` / `task-015` 在 `pendingReview`、不在 `dueToday` |
| **AC-04**<br>完成任务后离开「今日到期」并进入「待审」 | ✅ **PASS**（样本 = `task-004`，见 §2） | QA 用例：`completeTask('task-004')` → `status='done'` + `submissionStatus='pending'` → `dueIds` 不含它、`reviewIds` 含它 |
| **AC-05**<br>向全部 `reviewerIds` 各写 1 条 `review.pending` | ✅ **PASS** | 条数 = `allManagerIds().length`；`userId` 集合 **=== `task.reviewerIds` === `allManagerIds()`**；`readAt=null` / `channel='in_app'` / `status='sent'` / `data.taskId` / `title='待你审核'` / `body` 含标题与「已完成提报」全绿。**接收人来源反证**（§7-⑤）：用 `jest.spyOn` 令第 1 次 `allManagerIds()` 返回 `[user-001]`、后续返回 `[user-004]`，实测通知接收人 = `[user-001]` ⇒ **确实读 `task.reviewerIds`，未二次调用** |
| **AC-06**<br>完成→撤销→再完成 ⇒ 不新增 | ✅ **PASS** | 总数仍 = `allManagerIds().length`；原通知 `id` / `createdAt` / `readAt` 快照 `toEqual` 不变；`nextId` 序号未被消耗（§7-③） |
| **AC-07**<br>已读后再提交 ⇒ 该审核人 +1 | ✅ **PASS** | `markNotificationRead` 后重走流程：`user-001` 的 `review.pending` 变 2 条（其中未读 1 条、`id` 与旧条不同）；`user-004` 通知 `id` 列表 `toEqual` 不变 |
| **AC-08**<br>三处映射同步 | ✅ **PASS**（断言方式判定见 §7） | ① `NOTIFICATION_EVENT_LABEL['review.pending'] === '待审核提醒'`（`domain.ts:132`）**运行时断言**通过；② `NOTIFICATION_ICON['review.pending'] === 'inbox'`（`NotificationsScreen.tsx:31`）；③ `domain.ts:98` 注释已登记。**QA 额外补了运行时渲染断言**：真实渲染 `NotificationsScreen` 后 `Feather` 收到的 `name === 'inbox'`（对照：未知类型 → `'bell'`），AC-08② 由「文本断言」升级为「运行时断言」 |
| **AC-09**<br>点击通知 → 已读 + 深链 + meta 文案 | ✅ **PASS**（QA 新增覆盖） | 此前**无任何自动化覆盖**。QA 新增组件级用例：点击未读条目 ⇒ `markNotificationRead('notif-901')` 被调用 **且** `navigate('TaskDetail', { taskId: 'task-004', from: 'notification' })`；点击已读条目 ⇒ **不重复置已读**但仍深链；列表 meta 含「· 点击查看任务」（`NotificationsScreen.tsx:150`）。本次该链路**零改动**（源码 `:53-67` 实读确认） |
| **AC-10**<br>全量套件全绿 + 既有断言一字未改 | ✅ **PASS** | `Test Suites: 31 passed, 31 total / Tests: 502 passed, 502 total`；`today-focus-gate.test.tsx:205/219` 断言**逐字在位**（§9 原始输出） |
| **AC-11**<br>`tsc` 0 error；用例数 ≥ 445；零新增依赖 | ✅ **PASS** | `TSC_EXIT=0`；用例 502 ≥ 445；`package.json` / `package-lock.json` mtime = **2026-09-13 00:52**（增量 3 前），零新增依赖 |
| **AC-12**<br>操作人本人也收到；未读 4 → 5 | ✅ **PASS** | `getUnreadCount('user-001')` 4 → 5（Q4-1 不排除本人）；`pendingNotifs(user-001, task-004)` 未读恰 1 条 |

---

## 4. INV 结果表（INV-5 ~ INV-9）

| INV | 结论 | 证据 |
| --- | --- | --- |
| **INV-5**<br>`listTodayDue ∩ listPendingReview = ∅` | ✅ **PASS**（三态各验） | ① 种子态：交集 `[]`；② 「完成后」：交集 `[]`；③ 「撤销后」：交集 `[]` 且 `task-004` 回到「今日到期」 |
| **INV-6**<br>`submissionStatus==='pending'` ⇒ 不在 `listTodayDue` | ✅ **PASS** | `task-014` / `task-015`（种子 `pending`）不在 `dueToday`；「刚完成的 `task-004`」亦不在 |
| **INV-7**<br>N = 三分组 `task.id` 并集大小 | ✅ **PASS**（4 分支） | ① 同 id 跨组 ⇒ 计 1；② 同组重复 ⇒ 计 1；③ `includeReview=false` ⇒ `pendingReview` **整组不参与**（`3 → 2`）；④ **member 下同属 due+review 的任务仍计 1**（`task-014`：`includeReview=false` 时为 `1`，非「并集减 1」、亦未漏计）；⑤ `null` / `undefined` ⇒ `0` |
| **INV-8**<br>`status==='done'` ⇒ 不在 `listTodayDue` | ✅ **PASS** | `task-007` / `task-008`（`done`）不在列表；**条件① 单独生效**见 §5 |
| **INV-9**<br>三元组未读 `review.pending` ≤ 1 | ✅ **PASS** | 反复「完成→撤销→完成」3 轮后再完成：每位审核人未读条数 `≤ 1`，任务总条数 = `allManagerIds().length` |

---

## 5. ⚠️ 第 2 步：条件①（`status !== 'done'`）的**独立验证证据**

> **为什么必须单独构造**：种子中**没有**「`dueAt` 为今天 且 `status === 'done'`」的任务（`task-007` / `task-008` 的 `dueAt` 分别为 `demoDayAt(-4,…)` / `demoDayAt(-6,…)`）⇒ **单看种子无法验证条件①**（这是最容易漏写且漏写后测不出来的地方）。

### 5.1 方法：**前后对照 + 精确命中**（排除「整表异常导致误判通过」）

我选用 `task-016`（「本周复盘会材料」，`todo`，`dueAt = demoDayAt(0,16,0)`）作为独立样本（工程师用 `task-001`，样本不重合）：

```
步骤 1  先证明它「本来」满足「今日到期」的其余全部条件：
        · dueAt 非空 且 toDateKey(dueAt, Asia/Shanghai) === 今天      ✓
        · status !== 'cancelled'                                     ✓
        · submissionStatus !== 'pending'（种子为 undefined）          ✓
        · 非提报记录（source !== 'submission'）                       ✓
        ⇒ before = listTodayDue(...) 包含 'task-016'                  ✓
步骤 2  施加**唯一变化**：task.status = 'done'（submissionStatus 保持非 pending）
步骤 3  after = listTodayDue(...)
        · after 不含 'task-016'                                       ✓  ← 条件① 生效
        · after === before 去掉 'task-016' 后的序列（精确命中，其余 4 条不变） ✓
        · after.length === before.length - 1                          ✓
```

### 5.2 原始输出

```
√ done + dueAt 今天 + submissionStatus 非 pending ⇒ 被精确排除 (517 ms)
√ INV-8：done 任务（task-007 / task-008）不在「今日到期」 (189 ms)
```

**结论**：条件①（`task.status !== 'done'`，`task.service.ts:177`）**确实生效**，且是**精确命中**（只影响该条，未波及其它任务）。

---

## 6. ⚠️ 第 4 步：三组 id 清单 + 并集推导（AC-02 / AC-10 原始证据）

### 6.1 实测输出（QA 独立探针，`tests/increment3-qa.test.ts`）

```
[QA] dueToday      = ["task-001","task-004","task-005","task-016","task-017"]
[QA] pendingReview = ["task-014","task-015","task-019","task-020"]
[QA] approaching   = ["task-001","task-004","task-005","task-014","task-017","task-018"]
[QA] union         = 10 ["task-001","task-004","task-005","task-014","task-015","task-016","task-017","task-018","task-019","task-020"]
[QA] naive sum     = 15
```

### 6.2 并集推导（容斥校验）

| 分组 | 数量 | id 清单 |
| --- | --- | --- |
| 今日到期 | **5** | `task-001` `task-004` `task-005` `task-016` `task-017` |
| 待我审核 | **4** | `task-014` `task-015` `task-019` `task-020` |
| 临期预警 | **6** | `task-001` `task-004` `task-005` `task-014` `task-017` `task-018` |
| 朴素相加（旧头部口径） | **15** | —— |
| **并集（新头部口径）** | **10** | `task-001` `task-004` `task-005` `task-014` `task-015` `task-016` `task-017` `task-018` `task-019` `task-020` |

**重叠对（修复后）**：

| 重叠对 | 交集 | 个数 |
| --- | --- | --- |
| 今日到期 ∩ 待我审核 | `∅`（MUT-1 硬互斥达成） | **0** |
| 今日到期 ∩ 临期预警 | `task-001` `task-004` `task-005` `task-017`（`task-014` 已被移出） | **4** |
| 待我审核 ∩ 临期预警 | `task-014` | **1** |
| 三元交集 | `∅` | 0 |

**校验**：`5 + 4 + 6 − 0 − 4 − 1 + 0 = 10` ✅ ⇒ 头部 `visibleTotal = 10`（而非 15/17/18）。

> **与 PRD §2.1 表 3 的一致性**：PRD 记「修复后 5 / 4 / 6 → 朴素相加 15、汇总 10」，与本次实测**完全一致**。

---

## 7. 关键点的独立验证证据（对应任务书第 3 / 5 / 6 步）

### 7.1 第 3 步 · 并集口径的四个分支（`countVisibleFocusTasks`）

| 分支 | 用例 | 结果 |
| --- | --- | --- |
| ① 同 id 跨组只计 1 | `dueToday=pendingReview=approaching=[task-001]` ⇒ `1` | ✅ |
| ② 同组重复只计 1 | `dueToday=[task-001,task-001,task-001]` ⇒ `1` | ✅ |
| ③ `includeReview=false` ⇒ `pendingReview` **整组不参与** | `due=[001] review=[019] appr=[018]`：`true ⇒ 3`、`false ⇒ 2` | ✅ |
| ③' **member 下同属 due+review 仍计 1** | `due=[task-014] review=[task-014] appr=[]`，`false ⇒ 1` | ✅（**不是**「并集后减 1」，**也不是**「因无 review 权限而漏计」） |
| ④ `null` / `undefined` ⇒ `0` | `null ⇒ 0`、`undefined ⇒ 0` | ✅ |

源码实现（`src/utils/focus.ts:33-40`）与 K14 语义**逐字一致**：`Set` 承载 `task.id`，`includeReview` 为 `false` 时**跳过整个 `pendingReview` 循环**。

### 7.2 第 5 步 · 通知去重（AC-06 / AC-07 / INV-9）

| 验证点 | 结果 | 证据 |
| --- | --- | --- |
| 去重键 = `userId` + `type` + `data.taskId` | ✅ | 源码 `data/index.ts:178-184`；QA 用例逐维区分：改 `userId` / 改 `type` / 改 `taskId` **任一即不再命中**（各自写入） |
| 「未读」判定 = **`readAt === null`**（**不是** `status === 'sent'`） | ✅ | **双向反证**（工程师用例未覆盖）：<br>· 反证 A：`status='sent'` + `readAt=<时间戳>` ⇒ **不命中**（新增 1 条）⇒ 证明未按 `status` 判未读<br>· 反证 B：`status='read'` + `readAt=null` ⇒ **命中**（跳过）⇒ 证明确实按 `readAt` 判未读 |
| ① 未读 ⇒ 跳过且**不新增记录** | ✅ | `db.notifications.length` 不变，返回 `null` |
| ② 已读后再提交 ⇒ **新增一条** | ✅ | `markNotificationRead` 后重新写入 ⇒ 新 `id`、`readAt=null` |
| ④ 命中时**不消耗 `nextId`** | ✅ | 连续 2 次命中后，下一次成功写入的 `id` 序号 = 首条 + 1（`nextSeq === firstSeq + 1`）⇒ 去重路径未推进 `idSeq` |
| `data.taskId` 缺省 ⇒ 退化为无条件写入 | ✅ | `data: null` 连写 2 次 ⇒ `+2` |

### 7.3 第 6 步 · AC-05 接收人来源（`task.reviewerIds` vs 二次 `allManagerIds()`）

两者**当前取值相同**（`['user-001','user-004']`），因此「集合相等」类断言**无法区分**。我用 **`jest.spyOn` 制造分叉**：

```ts
const spy = jest.spyOn(dataModule, 'allManagerIds')
spy.mockReturnValueOnce([ME])        // 第 1 次调用（写入 task.reviewerIds）
spy.mockReturnValue(['user-004'])    // 任何后续调用（若被二次调用即暴露）
const done = await completeTask('task-004', { version })
expect(done.reviewerIds).toEqual([ME])
expect([...new Set(通知.userId)]).toEqual([ME])   // ← 若实现二次调用，此处会是 ['user-004']
```

**原始输出**：

```
√ 通知接收人取自 task.reviewerIds，而非二次调用 allManagerIds() (424 ms)
√ 正常路径：通知 userId 集合 === task.reviewerIds === allManagerIds() (218 ms)
```

⇒ **接收人来源确为 `task.reviewerIds`**（K18 达成，与 `listPendingReview:193` 的可见性判定同源）。

### 7.4 第 10 步 · 有意差异的守护（K15 / ARCH §9-5）

| 验证 | 结果 |
| --- | --- |
| `task-014`（`pending`）**离开**「今日到期」但**仍在**「临期预警」 | ✅ 通过。QA 用例把其 `dueAt` 锚定为 `demoDayAt(0,23,59)`（**恒落在 24h 窗口内**，消除时刻漂移）后断言：`due` 不含、`approaching` 含 |
| `listDeadlineApproaching` **未**被"顺手统一"（无 `submissionStatus !== 'pending'`） | ✅ 源码 `task.service.ts:205-222` 的过滤条件 = `dueAt` 窗口 + 排除 `done`/`cancelled` + 排除提报记录，**无 `submissionStatus` 条件**；`task-007`（`done`）仍被正确排除 |
| 徽标口径未被改成并集（K13） | ✅ `TodayFocusScreen.tsx:108-115` 的 `counts` 仍取分组长度 |

### 7.5 第 11 步 · `undoCompletion` 零通知操作（Q4-3）

| 验证方式 | 结果 |
| --- | --- |
| 源码实读 `task.service.ts:420-446` | 函数体内仅 `findTask` / `assertVersion` / `assertTransition` / 字段赋值 / `resolveUndoReviewReset` / `pushAudit` ⇒ **无** `pushNotification*` / `db.notifications` |
| **行为级**（QA 新增，比文本断言更强） | 「审核通过 → 撤销」前后 `JSON.stringify(db.notifications)` **逐字节相同**；「完成 → 撤销」前后 `db.notifications.length` **不变** |

### 7.6 第 12 步 · 边界与异常

| 场景 | 期望 | 结果 |
| --- | --- | --- |
| 陈旧 `version`（`completeTask`，`version + 5`） | 40901 | ✅ `ERR_OPTIMISTIC_LOCK` |
| 非法目标状态（`undoCompletion → 'blocked'`） | 40902 | ✅ `ERR_ILLEGAL_TRANSITION` |
| `completeTask('task-001')`（`todo → done`） | 40902 | ✅ **偏差-1 的行为级证据** |
| 驳回原因 < 4 字（`'短'`） | 42202 | ✅ `ERR_SUBMISSION_INVALID`，**且不产生任何通知** |

---

## 8. 回归结果（原始命令输出）

### 8.1 类型检查

```
$ npx tsc --noEmit
TSC_EXIT=0
```

### 8.2 全量测试（最终态）

```
$ npx jest --config jest.config.js
Test Suites: 31 passed, 31 total
Tests:       502 passed, 502 total
Snapshots:   0 total
Time:        42.342 s
Ran all test suites.
```

| 口径 | 套件 | 用例 |
| --- | --- | --- |
| 增量 2 基线 | 28 | 445 |
| 工程师交付态（+ `increment3-dedup-notify.test.ts` 31 条） | 29 | 476 |
| **本次 QA 验证态（+ `increment3-qa.test.ts` 22 条 + `increment3-notify-screen.test.tsx` 4 条）** | **31** | **502** |

### 8.3 定向复跑 5 个回归红线套件

```
$ npx jest --config jest.config.js tests/services.test.ts tests/round2-regression.test.ts \
    tests/today-focus-gate.test.tsx tests/increment2-completion.test.ts tests/submission-flow.test.ts
PASS tests/round2-regression.test.ts (10.627 s)
PASS tests/today-focus-gate.test.tsx (12.84 s)
PASS tests/services.test.ts (16.549 s)
PASS tests/increment2-completion.test.ts (20.072 s)
PASS tests/submission-flow.test.ts (21.009 s)

Test Suites: 5 passed, 5 total
Tests:       112 passed, 112 total
```

### 8.4 `submission-flow.test.ts:334-372`（**最可能被击穿处**）—— 精确计数断言逐条通过

```
审核结果站内通知（M2-P1-03）
  √ approve 一条 pending 提报 → 队首新增 1 条 review.result 通知 (689 ms)
  √ reject 一条 pending 提报 → 新增通知的正文包含驳回原因 (683 ms)
  √ reject 原因不足 4 字抛错 → 不产生任何通知 (560 ms)
```

> **判定**：该三例经 `submitItem` + `reviewSubmission`，**全程不含 `completeTask`**；本次新增的 `review.pending` 通知**只写在 `completeTask`** ⇒ 天然不进入其计数区间。**未被击穿**（K16 红线达成）。

### 8.5 `today-focus-gate.test.tsx:205 / :219`（断言零改动红线）

```
PASS tests/today-focus-gate.test.tsx (11.831 s)
  √ member 即使存在待审数据，也不渲染「待我审核」分组，且头部汇总不计入待审 (421 ms)
  √ manager 切到「待我审核」→ 渲染右滑「通过 / 驳回」与「查看详情」入口 (871 ms)
```

对应断言（**逐字在位，未改**）：

```
205:    expect(text).toContain('共 0 项待处理') // visibleTotal 排除 review（due+approaching=0）
219:    expect(text).toContain('共 1 项待处理') // visibleTotal 含 review
```

### 8.6 QA 新增用例的完整通过清单

```
PASS tests/increment3-qa.test.ts（22 条）
  √ 种子态：三组 id 清单与并集基数 = 10
  √ ⚠️ 时间相关性实证：把系统时间拨到「当日 08:00」⇒ 并集为 9（task-018 漂出 24h 窗口）
  √ done + dueAt 今天 + submissionStatus 非 pending ⇒ 被精确排除
  √ INV-8：done 任务（task-007 / task-008）不在「今日到期」
  √ task-001 种子状态为 todo，completeTask 抛 40902（todo → done 非法迁移）
  √ task-004（in_progress）可合法完成，AC-04 语义在替代任务上完整成立
  √ 反证 A：status=sent 但 readAt 非 null ⇒ 不命中去重
  √ 反证 B：status=read 但 readAt === null ⇒ 命中去重
  √ 三元组逐维区分 / √ data.taskId 缺省 ⇒ 退化为无条件写入 / √ 去重命中不消耗 nextId 序号
  √ 通知接收人取自 task.reviewerIds，而非二次调用 allManagerIds()
  √ 正常路径：通知 userId 集合 === task.reviewerIds === allManagerIds()
  √ 待审中任务（task-014）离开「今日到期」但仍在「临期预警」
  √ listDeadlineApproaching 对 done 的排除未被破坏
  √ 撤销「审核通过」前后 db.notifications 内容逐字节不变
  √ 撤销「完成」前后 db.notifications 长度不变
  √ 陈旧 version → 40901 / √ 非法目标状态 → 40902 / √ 驳回原因 < 4 字 → 42202 且零通知
  √ INV-9：反复 3 轮后每位审核人未读 review.pending ≤ 1
  √ AC-12：操作人本人也收到通知，未读数 4 → 5

PASS tests/increment3-notify-screen.test.tsx（4 条）
  √ review.pending 条目实际渲染 'inbox' 图标（非 fallback 'bell'）
  √ 对照：未知类型仍降级为 bell（证明上一条断言有区分度）
  √ 点击未读 review.pending：先置已读，再以 { taskId, from: notification } 深链
  √ 点击已读条目：不重复置已读，但仍深链
```

---

## 9. 既有断言零改动核验（第 9 步）

`apps/mobile` **未被 git 跟踪**（`git status` 显示 `?? apps/mobile/`），无法用 `git diff` 取基线，故采用 **mtime 窗口 + 内容逐条比对** 双重证据。

### 9.1 mtime 窗口证据

```
$ ls --full-time -1 tests/ | sort -k6,7        # 全部既有套件（截取最新 4 个）
-rw-r--r-- 1 Admin 197121 19226 2026-09-27 16:50:29 tests/increment2-completion.test.ts
-rw-r--r-- 1 Admin 197121  5836 2026-09-27 16:52:56 tests/round2-regression.test.ts
-rw-r--r-- 1 Admin 197121 15928 2026-09-27 17:02:39 tests/increment2-qa.test.ts
-rw-r--r-- 1 Admin 197121  7869 2026-09-27 17:03:30 tests/increment2-focus-footer.test.tsx
（其余 24 个既有套件 mtime 更早：09-13 / 09-26 / 09-27 03:4x~10:38）

$ ls --full-time -1 src/utils/focus.ts src/data/index.ts src/services/task.service.ts \
    src/types/domain.ts src/screens/NotificationsScreen.tsx src/screens/TodayFocusScreen.tsx
-rw-r--r-- 1 Admin 197121  1855 2026-09-27 18:26:01 src/utils/focus.ts
-rw-r--r-- 1 Admin 197121  7986 2026-09-27 18:26:20 src/data/index.ts
-rw-r--r-- 1 Admin 197121 37765 2026-09-27 18:26:36 src/services/task.service.ts
-rw-r--r-- 1 Admin 197121  6966 2026-09-27 18:27:01 src/screens/NotificationsScreen.tsx
-rw-r--r-- 1 Admin 197121 24021 2026-09-27 18:27:47 src/screens/TodayFocusScreen.tsx
-rw-r--r-- 1 Admin 197121  4650 2026-09-27 18:27:58 src/types/domain.ts
```

**判定**：**28 个既有套件的最新 mtime = `2026-09-27 17:03:30`**，而增量 3 的**全部源码改动落在 `18:26:01 ~ 18:27:58`**、新增测试文件为 `18:33:32`。⇒ **增量 3 施工窗口内没有任何既有测试文件被写盘**。

### 9.2 内容逐条比对证据（红线断言逐字在位）

```
$ grep -n "共 0 项待处理\|共 1 项待处理" tests/today-focus-gate.test.tsx
205:    expect(text).toContain('共 0 项待处理') // visibleTotal 排除 review（due+approaching=0）
219:    expect(text).toContain('共 1 项待处理') // visibleTotal 含 review

$ grep -n "db.notifications.length" tests/submission-flow.test.ts
336/340: before / before + 1        （approve）
350/355: before / before + 1        （reject）
365/370: before / before            （短原因）

$ grep -n "review.result" tests/increment2-completion.test.ts
386/389/397/419: 按 type 过滤的计数断言（未被新类型污染）

$ grep -n "db.notifications.length" tests/mention.test.ts
43/47/50/64/66/70/72: @提及链路精确计数（不含 completeTask）

$ sed -n '32,45p;168,184p' tests/services.test.ts
32-45:  listTodayDue「dueAt 在今天 / 非 cancelled / length > 0」+ listDeadlineApproaching
168-184: reviewSubmission 通过/驳回（task-014 approve → done；task-015 reject → in_progress + reviewNote）
```

**结论：既有 28 个套件的断言 100% 未被修改**（mtime 窗口 + 逐条内容双重确认）。

> **附**：QA 本轮**只新增**了 2 个测试文件（`tests/increment3-qa.test.ts`、`tests/increment3-notify-screen.test.tsx`），**未修改**工程师的 `tests/increment3-dedup-notify.test.ts`，也**未修改** `src/` 下任何文件。

---

## 10. 发现的问题清单

| # | 严重度 | 位置 | 问题 | 证据 | 处置建议 |
| --- | --- | --- | --- | --- | --- |
| **1** | **P2** | `tests/increment3-dedup-notify.test.ts:113` | `expect(countVisibleFocusTasks(focus, { includeReview: true })).toBe(10)` 是**时刻相关断言**：「临期预警」是 24h 滑动窗，`task-018`（`dueAt = demoDayAt(1,12,0)`）**仅当运行时刻 ≥ 当日 12:00** 才落在窗口内。**上午运行 ⇒ 并集 = 9 ⇒ 该用例误报红** | QA 实证（§8.6）：把系统时间拨到**当日 08:00**，实测 `approaching = ["task-001","task-004","task-005","task-014","task-015","task-016","task-017"]`、**`union = 9`**（`task-018` 漂出窗口） | 改为时刻鲁棒写法（1 行）：<br>`const base = [9 条稳定 id]`<br>`const expected = approaching.includes('task-018') ? [...base,'task-018'].sort() : base`<br>`expect(countVisibleFocusTasks(focus,{includeReview:true})).toBe(expected.length)`<br>（QA 文件已用该写法） |
| **2** | **P2** | `tests/increment3-dedup-notify.test.ts:244` | `expect(approachingIds).toContain('task-014')` 同为时刻相关：`task-014` 的 `dueAt = demoDayAt(0,19,0)`，**当运行时刻 > 20:00 时**其漂出 `[now−1h, now+24h]` ⇒ 误报红 | 同源（`task.service.ts:208-215` 窗口定义 + `seed.ts:442` 的 `dueAt`） | 锚定 `dueAt` 消除漂移（1 行）：<br>`findTask('task-014')!.dueAt = demoDayAt(0, 23, 59)`（当日 23:59 **恒**在 24h 窗口内）<br>（QA 文件已用该写法） |
| **3** | P3 | `PRD-mobile-increment-3.md` AC-02 / AC-01 | AC 的「10」本身是**时刻相关**值（PRD §8-10 已登记「需当日同一时刻复跑」），但 §6.1 的 AC-02 表格未在判据行内显式限定「当日 12:00 之后」 | §8.6 的 08:00 实证：并集 = 9 | 文档补充：在 AC-02 判据行注明「`task-018` 是否计入取决于运行时刻；10 为当日 12:00 之后的取值」 |
| **4** | P3 | `tests/today-focus-gate.test.tsx:205` 注释 | 注释文案「`visibleTotal 排除 review（due+approaching=0）`」在**并集口径**下措辞略旧（现口径为「并集」，而非「排除 review」），但**断言值正确**且属**受保护的既有断言** | 源码 `:205` 原文 | **不改**（AC-10 要求一字不改）。仅登记，供后续增量清理 |
| **5** | P3 | `src/types/domain.ts:98` 注释登记处 | 该注释仍**不完整**（缺 `task.completed` / `review.result`），本次按范围铁律只追加 `review.pending` | 实读 `domain.ts:98` | **不改**（ARCH §9-6 已登记）。建议后续增量把该注释改为**唯一类型登记表 + CI 校验** |

> **无 P0 / P1**。问题 1 / 2 **均为测试代码的时刻鲁棒性缺陷**（期望值语义正确、当前时刻通过），**不是实现缺陷**，不影响任何 AC 判定。

---

## 11. 智能路由判定

### 11.1 第 1 轮判定（历史结论，**已被第 2 轮取代**）

**判定：🟡 `QA`**

| 维度 | 结论 |
| --- | --- |
| **源码是否有 Bug？** | ❌ **无**。5 个改动点与 ARCH/PRD 逐条一致；AC-01~AC-12、INV-5~INV-9 全通过；`tsc` 0 error；502 用例全绿。**工程师无需返工。** |
| **测试代码是否有 Bug？** | ✅ **有 2 处**（§10 问题 1 / 2）：工程师新增的 `tests/increment3-dedup-notify.test.ts` 中 2 条**时刻相关断言**，会在一天中的特定时段误报红。 |
| **路由** | 按「测试代码自身有 Bug ⇒ QA 自行修」的规则 ⇒ **`QA`** |

**第 2 轮（QA 自修）计划**：
1. 修正 `increment3-dedup-notify.test.ts:113` 与 `:244` 两处断言为**时刻鲁棒**写法（语义不变，仅消除对运行时刻的依赖）；
2. **不触碰**其余 28 个既有套件的任何断言（红线）；
3. 复跑 `npx tsc --noEmit` + `npx jest --config jest.config.js`，并在**模拟 08:00 / 20:30 两个时刻**下验证不再漂移。

> 附（第 1 轮原文）：若主理人认为「P2 仅为潜在 flake、当前不失败」而不要求返工，则本增量可直接判 **`NoOne`**。
> **主理人（齐活林）裁定：路由维持 `QA`，要求第 2 轮自修** —— 理由是这两处不是「潜在 flake」而是**确定会在特定时段变红**（上午 12:00 前 / 20:00 后必红），会污染 CI 与后续增量回归基线。**该裁定已执行完毕，见 §13。**

### 11.2 最终判定（第 2 轮完成后）

**判定：🟢 `NoOne`**

| 维度 | 结论 |
| --- | --- |
| **源码是否有 Bug？** | ❌ **无**（第 2 轮**未改 `src/` 任何文件**，第 1 轮「零缺陷」结论不变）。 |
| **测试代码是否有 Bug？** | ✅ 曾有 2 处（§10 问题 1 / 2）→ **已修复**（第 2 轮 QA 自修，语义不变，仅消除时刻依赖，§13）。 |
| **回归** | ✅ `npx tsc --noEmit` → **exit 0**；`npx jest --config jest.config.js` → **31 套件 / 502 用例全绿**；两处断言在 **08:00 / 20:30** 两个时刻下**均不再漂移**（§13.3）。 |
| **路由** | 源码零缺陷 + 测试缺陷已自修完毕 + 全绿 ⇒ **`NoOne`**（无返工对象）。 |

---

## 12. 交付物与新增测试文件

| # | 文件 | 说明 |
| --- | --- | --- |
| 1 | `docs/mobile-app/QA-mobile-increment-3.md` | **本报告** |
| 2 | `apps/mobile/tests/increment3-qa.test.ts`（**新增，22 条**） | 独立复算三组 id/并集、条件① 前后对照、偏差-1 行为级复核、去重键与「未读」字段双向反证、AC-05 接收人 spy 反证、K15 确定性验证、`undoCompletion` 行为级零通知、边界异常码、**时间相关性实证** |
| 3 | `apps/mobile/tests/increment3-notify-screen.test.tsx`（**新增，4 条**） | `NotificationsScreen` 组件级：AC-08② **运行时图标断言**（含 fallback 对照）、AC-09 **点击已读 + 深链**行为（此前无覆盖） |

```
$ ls -l apps/mobile/tests/increment3-*
-rw-r--r-- 1 Admin 197121 20904 Sep 27 18:33 tests/increment3-dedup-notify.test.ts   （工程师交付）
-rw-r--r-- 1 Admin 197121  6686 Sep 27 18:52 tests/increment3-notify-screen.test.tsx （QA 新增）
-rw-r--r-- 1 Admin 197121 19213 Sep 27 18:54 tests/increment3-qa.test.ts            （QA 新增）
```

> 注：以上为**第 1 轮快照**。`increment3-dedup-notify.test.ts` 已于**第 2 轮**由 QA 修正时刻相关断言（现 21957 字节 / mtime `2026-09-27 19:01:19`，见 §13）；其余两个 QA 新增文件第 2 轮**未改动**。

**QA 未修改 `src/` 下任何文件**（铁律遵守）；**未修改任何既有 28 个套件的断言**。

---

## 13. 第 2 轮（QA 自修）—— 时刻鲁棒性修正与实证

> **触发**：主理人（齐活林）裁定「路由维持 `QA`，由 QA 在第 2 轮自行修正 §10 问题 1 / 2」。
> **理由**：这两处不是「潜在 flake」，而是**确定会在一天中特定时段变红**的缺陷（上午 12:00 前 / 20:00 后必红），会污染 CI 与后续增量的回归基线，必须消除对运行时刻的依赖。
> **铁律遵守**：只改测试代码 · **只改 `tests/increment3-dedup-notify.test.ts` 一个文件** · 零新增依赖 · 未改 `src/` · 未碰 `today-focus-gate.test.tsx:205/219` 及其余 28 个既有套件。
> **运行窗口**：2026-09-27 19:00 ~ 19:07（Asia/Shanghai）。

### 13.1 改动清单（1 个文件 / 语义不变 / 仅消除时刻依赖）

改动文件：`apps/mobile/tests/increment3-dedup-notify.test.ts`

**改动 0（配套导入）**：`@/data` 导入新增 `demoDayAt`（改动 2 的锚定所需，无其它用途）。

```diff
   allManagerIds,
   db,
+  demoDayAt,
   findTask,
```

**改动 1（原 line 113）**：`toBe(10)` → **时刻鲁棒**（9 条稳定 id 为基线 + 按 24h 窗口动态决定是否计入 `task-018`）。
**保留**原 line 112 的自洽断言 `expect(...).toBe(unionIds(focus, true).length)`（其本身时刻鲁棒，未动）。

```diff
-  it('manager（includeReview=true）⇒ 三分组并集大小（种子形态下 = 10）', async () => {
+  it('manager（includeReview=true）⇒ 三分组并集大小（时刻鲁棒：稳定 9 条 + task-018 视窗口计入）', async () => {
     const focus = await focusService.getTodayFocus(ME, SH)
     expect(countVisibleFocusTasks(focus, { includeReview: true })).toBe(unionIds(focus, true).length)
-    expect(countVisibleFocusTasks(focus, { includeReview: true })).toBe(10)
+    // 「临期预警」是 24h 滑动窗：task-018（dueAt = 次日 12:00）仅当运行时刻 ≥ 当日 12:00 才落入窗口。
+    // 故以 9 条稳定 id 为基线，按实际是否命中窗口动态决定是否计入 task-018（消除对运行时刻的依赖）。
+    const stableIds = [
+      'task-001', 'task-004', 'task-005', 'task-014', 'task-015',
+      'task-016', 'task-017', 'task-019', 'task-020',
+    ]
+    const approachingIds = focus.approaching.map((task) => task.id)
+    const expected = approachingIds.includes('task-018') ? [...stableIds, 'task-018'].sort() : stableIds
+    expect(countVisibleFocusTasks(focus, { includeReview: true })).toBe(expected.length)
   })
```

> 说明：仅**同步更新了用例标题**（去掉硬编码「= 10」，改为「稳定 9 条 + task-018 视窗口计入」），因原标题在同一缺陷下也会在上午时段失真；**断言语义不变**（仍验证「头部汇总 = 三分组并集大小」），只消除对运行时刻的依赖。

**改动 2（原 line 244）**：先锚定 `task-014.dueAt = 当日 23:59`（恒在 `[now−1h, now+24h]` 窗口内）再断言；并**补上 K15 语义锚点** `submissionStatus === 'pending'`，确保「口径差异本身」仍被有效覆盖。

```diff
   it('listDeadlineApproaching 未同步排除 pending（有意保留的口径差异，K15 / §9-5）', async () => {
+    // K15 口径差异的锚点：task-014 处于「待审中」（pending），却仍留在「临期预警」。
+    const task = findTask('task-014')!
+    expect(task.submissionStatus).toBe('pending')
+    // 锚定 dueAt 到当日 23:59 ⇒ 恒落在 [now−1h, now+24h] 窗口内（消除运行时刻漂移）
+    task.dueAt = demoDayAt(0, 23, 59)
+
     const approachingIds = (await taskService.listDeadlineApproaching(ME, SH)).map((t) => t.id)
     expect(approachingIds).toContain('task-014')
   })
```

> **K15 语义保留论证**：该用例验证的核心是「`listDeadlineApproaching` **不**排除 `submissionStatus==='pending'`」（与 `listTodayDue` 的有意口径差异）。新增的 `expect(task.submissionStatus).toBe('pending')` 正是把「待审中」这一前提**显式锚定**在断言内 —— 即「一个 pending 任务仍出现在临期预警里」，口径差异**不仅未丢，反而更明确**；锚定 `dueAt` 只消除了窗口漂移，不改变该语义。

### 13.2 验证命令与输出

```
$ npx tsc --noEmit
TSC_EXIT=0

$ npx jest --config jest.config.js
Test Suites: 31 passed, 31 total
Tests:       502 passed, 502 total
Snapshots:   0 total
Time:        41.184 s
Ran all test suites.
```

（第 1 轮为 31 / 502，本轮**套件数与用例数均不变**、全绿。）

### 13.3 时刻鲁棒性实证（08:00 / 20:30 两时刻）

方法：临时 jest 配置追加「假时钟」setup（`jest.useFakeTimers({ doNotFake: ['setTimeout', …] })` + `jest.setSystemTime(...)`，保留真实定时器以免 `simulateLatency()` 挂起），**验证后即删除该临时脚手架（非交付物）**。

**（a）漂移探针**（打印 `approaching` / 并集 / `task-014` 锚定前后）：

```
######## FAKE_NOW = 2026-09-27 08:00 (+08:00) ########
[TMP] fake now        = 2026-09-27T00:00:00.000Z
[TMP] approaching     = ["task-001","task-004","task-005","task-014","task-015","task-016","task-017"]
[TMP] task-018 in appr= false
[TMP] union size      = 9 ["task-001","task-004","task-005","task-014","task-015","task-016","task-017","task-019","task-020"]
[TMP] task-014 in appr (seed dueAt=19:00) = true
[TMP] task-014 in appr (anchored 23:59)  = true

######## FAKE_NOW = 2026-09-27 20:30 (+08:00) ########
[TMP] fake now        = 2026-09-27T12:30:00.000Z
[TMP] approaching     = ["task-004","task-005","task-017","task-018"]
[TMP] task-018 in appr= true
[TMP] union size      = 10 ["task-001","task-004","task-005","task-014","task-015","task-016","task-017","task-018","task-019","task-020"]
[TMP] task-014 in appr (seed dueAt=19:00) = false
[TMP] task-014 in appr (anchored 23:59)  = true
```

**探针结论**（证实两处缺陷真实存在、且修正后不再漂移）：

| 时刻 | 并集（`task-018` 是否入窗） | `task-014`（seed `dueAt=19:00`） | 结论 |
| --- | --- | --- | --- |
| **08:00** | **9**（`task-018` 漂出）⇒ 旧 `toBe(10)` **必红** | 仍在窗内 | 改动 1 使其恒绿（`expected=9`） |
| **20:30** | **10**（`task-018` 入窗） | **漂出**（19:00 < 20:30−1h）⇒ 旧 `toContain('task-014')` **必红** | 改动 2 锚定后恒绿 |

**（b）真实文件复跑**（`tests/increment3-dedup-notify.test.ts` 全量，含两条被修用例）：

```
######## REAL FILE @ FAKE_NOW = 08:00 ########
PASS tests/increment3-dedup-notify.test.ts (17.215 s)
    √ manager（includeReview=true）⇒ 三分组并集大小（时刻鲁棒：稳定 9 条 + task-018 视窗口计入） (298 ms)
    √ listDeadlineApproaching 未同步排除 pending（有意保留的口径差异，K15 / §9-5） (250 ms)
    …（其余 29 条同绿）…
Test Suites: 1 passed, 1 total
Tests:       31 passed, 31 total

######## REAL FILE @ FAKE_NOW = 20:30 ########
PASS tests/increment3-dedup-notify.test.ts (14.204 s)
    √ manager（includeReview=true）⇒ 三分组并集大小（时刻鲁棒：稳定 9 条 + task-018 视窗口计入） (304 ms)
    √ listDeadlineApproaching 未同步排除 pending（有意保留的口径差异，K15 / §9-5） (282 ms)
    …（其余 29 条同绿）…
Test Suites: 1 passed, 1 total
Tests:       31 passed, 31 total
```

⇒ **两处断言在 08:00 与 20:30 下均恒绿**（修复前两时刻分别必红），**不再对运行时刻敏感**。

### 13.4 红线核验（既有套件 / `src/` 未被触碰）

**本轮唯一被写盘的测试文件 = `tests/increment3-dedup-notify.test.ts`**（mtime `19:01:19`）。全部既有套件 mtime **保持不变**：

```
$ ls --full-time -1 tests/*.test.* | sort -k6,7   （末 6 行）
-rw-r--r-- 1 Admin 197121 10420 2026-09-27 10:35:29 tests/today-focus-gate.test.tsx   ← AC-10 红线，未变
-rw-r--r-- 1 Admin 197121 19226 2026-09-27 16:50:29 tests/increment2-completion.test.ts
-rw-r--r-- 1 Admin 197121  5836 2026-09-27 16:52:56 tests/round2-regression.test.ts
-rw-r--r-- 1 Admin 197121 15928 2026-09-27 17:02:39 tests/increment2-qa.test.ts
-rw-r--r-- 1 Admin 197121  7869 2026-09-27 17:03:30 tests/increment2-focus-footer.test.tsx   ← 28 既有套件最新 mtime
-rw-r--r-- 1 Admin 197121  6686 2026-09-27 18:52:48 tests/increment3-notify-screen.test.tsx （第 1 轮 QA 新增，未动）
-rw-r--r-- 1 Admin 197121 19213 2026-09-27 18:54:54 tests/increment3-qa.test.ts            （第 1 轮 QA 新增，未动）
-rw-r--r-- 1 Admin 197121 21957 2026-09-27 19:01:19 tests/increment3-dedup-notify.test.ts   ← 本轮唯一改动
```

- **28 个既有套件最新 mtime 仍为 `17:03:30`**（第 1 轮核验值），本轮窗口（19:00~19:07）内**无任何既有套件被写盘**。
- `tests/today-focus-gate.test.tsx:205/219` 红线断言**逐字在位**：

```
$ grep -n "共 0 项待处理\|共 1 项待处理" tests/today-focus-gate.test.tsx
205:    expect(text).toContain('共 0 项待处理') // visibleTotal 排除 review（due+approaching=0）
219:    expect(text).toContain('共 1 项待处理') // visibleTotal 含 review
```

- **`src/` 关键文件 mtime 仍为 `18:26:01 ~ 18:27:58`**（增量 3 施工窗口），**本轮未改 `src/` 任何文件**：

```
$ ls --full-time -1 src/utils/focus.ts src/data/index.ts src/services/task.service.ts \
    src/types/domain.ts src/screens/NotificationsScreen.tsx src/screens/TodayFocusScreen.tsx
-rw-r--r-- 1 Admin 197121  1855 2026-09-27 18:26:01 src/utils/focus.ts
-rw-r--r-- 1 Admin 197121  7986 2026-09-27 18:26:20 src/data/index.ts
-rw-r--r-- 1 Admin 197121 37765 2026-09-27 18:26:36 src/services/task.service.ts
-rw-r--r-- 1 Admin 197121  6966 2026-09-27 18:27:01 src/screens/NotificationsScreen.tsx
-rw-r--r-- 1 Admin 197121 24021 2026-09-27 18:27:47 src/screens/TodayFocusScreen.tsx
-rw-r--r-- 1 Admin 197121  4650 2026-09-27 18:27:58 src/types/domain.ts
```

- 临时验证脚手架（`jest.tmp.config.js` / `tests/_tmp-fake-time.setup.js` / `tests/_tmp-drift-probe.test.ts`）**已删除**，`apps/mobile` 根与 `tests/` 下无残留 `*tmp*` 文件。

### 13.5 最终判定

**🟢 `NoOne`** —— 源码**零缺陷**（本轮未改 `src/`）+ 测试侧 2 处时刻相关缺陷**已自修完毕**（语义不变）+ `tsc` exit 0 + **31 套件 / 502 用例全绿** + 两处断言在 **08:00 / 20:30** 下**均不再漂移**。无返工对象，增量 3 可验收。
