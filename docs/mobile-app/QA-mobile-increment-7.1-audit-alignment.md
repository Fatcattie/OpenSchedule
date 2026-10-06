# QA 报告（增量 7.1）— OpenSchedule 移动端：孤儿评审子任务修复 + C/E 耦合缺陷 + 组件测试

> 验证人：严过关（QA） · 日期：2026-09-30 · 轮次：**第 1 轮独立验证（含变异测试）**
> 判据：`ARCH-mobile-increment-7-audit-alignment.md` §2.4（A/C/E 修复方案）· 增量 7.1 修复设计（A/B/C/D/E）
> 被验对象：工程师寇豆码实现的增量 7.1（**修 4 类缺陷：A 孤儿消除 / C 复用过滤排除 cancelled / E 门禁不阻塞 cancelled / B 组件渲染测试**）
> 独立性声明：**不采信** team-lead 与工程师的任何结论；全部结论基于**独立复跑 + 变异测试（逐个临时回退）+ 自建反例探针 + 实读源码**。
> 约束遵守：**未修改 `apps/mobile/src` 与既有测试文件**；变异测试的临时改动**已全部还原并经 md5 校验**；自建探针文件**已全部删除**。

---

## 0. TL;DR

| 项 | 结论 |
| --- | --- |
| **独立复跑基线** | ✅ `npx tsc --noEmit` → **exit 0**；`npx jest --config jest.config.js` → **40 套件 / 771 用例全绿**（与 team-lead/工程师声明一致） |
| **变异测试（6 项）** | ✅ **6 / 6 全部使至少一条用例失败** ⇒ 新增用例**非橡皮图章**。其中 4 项（M1/M2/M3/M4）精确命中预期的 R-1 / R-6 / S-1 / S-2 |
| **A 孤儿消除** | ✅ 撤回 / 撤销 / moveTask / reopenTask **四条清理路径**均关闭未完成评审子任务；4 个 `applyClearedReviewState` 清理点**全部**接入 `closeOpenReviewSubtasks` |
| **C 复用过滤** | ✅ `ensureReviewSubtask` 排除 `cancelled`（`:1346`）；已取消子任务不复用，重新提报时新建 |
| **E 门禁** | ✅ `canApproveMainTask` 视 `cancelled` 子任务为不阻塞（`audit.ts:117-122`） |
| **B 组件测试** | ✅ `audit-center-render.test.tsx` T-1~T-4 **均为真渲染**（变异 MB 证明 T-2 真守门禁） |
| **反向（防过度修复）** | ✅ 驳回后子任务存活 + 复用同一条；审核轮回态子任务存活 + 仍在待审队列 |
| **边界** | ✅ 幂等（已 cancelled/done 不二次改动、不改 version）；无子任务不抛错；已 done 子任务不被关闭；多子任务一次全关且跳过 done |
| **零通知** | ✅ 关闭子任务前后 `db.notifications` 长度 `9 → 9`、类型集合完全一致（无新类型） |
| **断言削弱排查** | ✅ 无 `skip/only/xit/todo`、无注释 `expect`；`submissionStatus =` 恰 **7 处**；`withdrawCompletion` 切片不含 4 个禁忌字面量；**收窄后的 increment4-qa 断言仍能捕获「撤回写 cancelled」**（变异 M5 证明） |
| **共享状态污染** | ✅ 无。`audit-center` / `increment4-qa` 均 `beforeEach(resetDatabase)`；全部 NO-RESET 套件**不触碰 `db.tasks`**；渲染测试 mock 掉 services 不碰真实 db |
| **看板 / 统计一致性** | ✅ 看板列总数 === 非 cancelled 项目任务数（12=12）；被关闭子任务不再占列；`getProjectStats.progress` 正常 |
| **问题清单** | P0 × 0、P1 × 0、P2 × 0、P3 × 4（**存疑 / 登记项**，均非阻塞；详见 §8） |
| **临时探针清理** | ✅ **2 个临时探针文件（共 17 个临时用例）已全部删除**；`tests/` 无残留；`src/` 经 md5 校验**零改动** |

**一句话**：**实现是对的，可以验收。** 6 项变异测试全部命中（无橡皮图章），A/C/E/B 四类修复经独立探针与静态审计逐项成立；仅 4 项非阻塞存疑（数据增长 / 通知缺失 / 边界可达性 / 幂等可达性），供后续按需处理。

---

## 1. 验证环境

| 项 | 值 |
| --- | --- |
| 工作目录 | `d:\GLMclaw\workspace\openschedule`（代码在 `apps/mobile`） |
| 运行时刻 | 2026-09-30（Asia/Shanghai） |
| 运行时 | Expo 57 / RN 0.86.3 / React 19 / TS 6 / Jest 29（`jest-expo` preset） |
| 命令 | `cd apps/mobile && npx jest --config jest.config.js` · `cd apps/mobile && npx tsc --noEmit`（`package.json` **无 `test` 脚本**，必须走该命令） |
| 数据态 | 每个用例 `beforeEach(() => resetDatabase())`（内存库复位到种子） |
| 源码改动 | **QA 未修改 `src/` 任何文件**；变异测试的临时改动**已还原**（md5 逐一比对一致） |
| 临时探针 | `tests/__qa71_tmp_probe.test.ts`（14 例）、`tests/__qa71_tmp_probe2.test.ts`（3 例）—— **均已删除** |

> **注**：本次执行环境出现 Bash stdout 捕获失效，QA 改用「命令重定向到日志文件 + Read 读取」的方式取回结果，不影响任何结论。

---

## 2. 基线复现（独立，不采信）

| 项 | 实测 | 结论 |
| --- | --- | --- |
| `tsc` | `npx tsc --noEmit` → **exit 0，零错误** | ✅ |
| 全量测试（首跑） | `Test Suites: 40 passed, 40 total`；`Tests: 771 passed, 771 total` | ✅ |
| 变异后恢复再跑 | 再次 `40 passed / 771 passed`，`EXIT=0` | ✅ 回到基线 |
| `tests/` 文件数 | **40 个 `.test.ts(x)`**（39 既有 + 新增 `audit-center-render.test.tsx`） | ✅ |

---

## 3. 变异测试结果表（**核心**）

> 方法：逐个**临时回退**目标改动 → 运行相关套件 → 记录失败用例 → **立即恢复并 md5 校验**。

| # | 回退的改动 | 预期失败用例 | **实测失败用例** | 失败断言证据 | 判定 |
| --- | --- | --- | --- | --- | --- |
| **M1** | 删掉 `withdrawCompletion` 的 `closeOpenReviewSubtasks(task)`（`:1105`） | R-1 | ✅ **R-1**（1 failed / 36 passed） | `audit-center.test.ts:430` `expect(children[0].status).toBe('cancelled')` → 收到 `'todo'` | ✅ 有效 |
| **M2** | 把 `undoCompletion` 的调用改为**无条件**（脱离 `if (reviewReset)`） | R-6 | ✅ **R-6**（1 failed / 36 passed） | `audit-center.test.ts:496` `.not.toBe('cancelled')` → 收到 `'cancelled'` | ✅ 有效（陷阱守门成立） |
| **M3** | 去掉 C 的 `&& task.status !== 'cancelled'`（`:1346`） | S-1 | ✅ **S-1**（1 failed / 36 passed） | `audit-center.test.ts:518` `expect(children).toHaveLength(2)` → 收到 1 | ✅ 有效 |
| **M4** | 去掉 E 的 `&& child.status !== 'cancelled'`（`audit.ts:121`） | S-2 | ✅ **S-2**（1 failed / 36 passed） | `audit-center.test.ts:535` `expect(canApproveMainTask(...)).toBe(true)` → 收到 `false` | ✅ 有效 |
| **M5** | 让 `withdrawCompletion` 把**主任务**置 `cancelled`（模拟 INV-5 缺陷） | increment4-qa 收窄断言仍失败 | ✅ **5 failed / 50 passed**，含 `QA · AC-10 / INV-5 · 正式任务永不被撤回动作写成 cancelled`；`AC-03` 收到 `'cancelled'`（期望 `'in_progress'`）；`源码级 · withdrawCompletion 永不把 status 写成 cancelled（INV-5）` 亦失败 | `increment4-qa.test.ts:254` 附近 | ✅ 收窄**未把断言变瞎** |
| **MB** | 让 `AuditCenterScreen` 的 `canReview` 恒 `true`（绕过权限门禁） | T-2 | ✅ **T-2**（1 failed / 3 passed） | `audit-center-render.test.tsx` member 分支 `expect(findByLabel('审核')).toHaveLength(0)` → 收到 3 | ✅ 组件测试真守门禁 |

**结论**：6 项回退**全部**使至少一条用例失败 ⇒ **不存在「测试通过但无效」的橡皮图章**。恢复后全量复跑回到 **40 / 771 全绿**，且 3 个被改文件 md5 与备份**逐一相同**。

---

## 4. 独立复现记录（自建临时探针，非复用既有用例）

### 4.1 探针一（14 例，全绿）

| 分组 | 用例 | 结论 |
| --- | --- | --- |
| 孤儿消除（自建） | 撤回路径：child `todo → cancelled` 且 `version+1` / `updatedAt` 前移 | ✅ |
| | 撤销路径（`submissionStatus: null`）：child → `cancelled`，主任务 `reviewRequired=false` | ✅ |
| | `moveTask` 离开 `pending_review` → child 关闭 | ✅ |
| | `reopenTask` 离开 `pending_review` → child 关闭 | ✅ |
| 反向（防过度修复） | 驳回后 child 存活 + 再次提报**复用同一条**（计数 1、id 不变） | ✅ |
| | 审核轮回态（`undoCompletion` + `submissionStatus:'pending'`）child 存活 + 仍在 `listPendingReview` | ✅ |
| 边界 | 幂等：child 已 `cancelled` ⇒ 再次触发**不改 version / updatedAt** | ✅ |
| | 连调两次（人工重入 `pending_review` 后再离开）：第二次不再改动已 `cancelled` 的 child | ✅ |
| | child 已 `done` ⇒ 撤回动作**不关闭**它 | ✅ |
| | 主任务**无子任务**时触发**不抛错** | ✅ |
| | 多子任务：一次触发关闭全部未完成、跳过已 `done` | ✅ |
| 零通知 | 关闭前后 `db.notifications` 长度 `9 → 9`；类型集合 `[ai.proposal, deadline_approaching, mention, review.pending, task.assigned, task.completed, task.review.pending]` **完全一致** | ✅ |
| 列表一致性 | 撤回后主任务回 `in_progress` 进 `listMyTodos`；被取消 child 不在待办 | ✅ |
| 门禁 | 全部 child 被关闭后 `canApproveMainTask ⇒ true` | ✅ |

### 4.2 探针二（3 例，全绿）

| 用例 | 实测 | 结论 |
| --- | --- | --- |
| 看板列计数 + 统计一致性 | 完成提报后 child 占 `todo` 列；撤回关闭后**看板总数 12 === 非 cancelled 项目任务数 12**，child 不在任何列，`getProjectStats.progress = 0.1667`（2/12） | ✅ |
| `listTodayDue` / `listDeadlineApproaching` | child（`dueAt=null`）不出现；主任务撤回后**重新出现**在今日到期 | ✅ |
| 连做 3 轮「完成→撤回」 | 每轮恰 1 个 open child，最终 **0 open**（3 条 `cancelled`，无累积孤儿） | ✅ |

---

## 5. 断言削弱排查（第三层）

| 排查项 | 实测 | 结论 |
| --- | --- | --- |
| `it.skip` / `xit` / `it.only` / `describe.only` / `it.todo` | 全仓 `tests/` + `src/` 搜索 ⇒ **NONE** | ✅ |
| 被注释的 `expect(` | 搜索 `// expect(` / `/* expect(` ⇒ **NONE** | ✅ |
| **`increment4-qa.test.ts:357-359` / `:373-375` 收窄** | 仅把 filter 追加 `&& task.isReviewTask !== true`，`expect(cancelledAfter).toEqual(cancelledBefore)` **本体未动**；变异 M5 证明该用例**仍能捕获**「撤回把正式任务写 `cancelled`」 | ✅ 未变瞎 |
| 新用例弱断言 | R-1~R-6 / S-1/S-2 / T-1~T-4 均为强断言（`toBe('cancelled')` / `toHaveLength` / `toEqual` 数组 / `accessibilityState.disabled`）；未见「只断言不抛错」「`toBeTruthy()` 兜底」 | ✅ |
| `submissionStatus =` 赋值数 | `task.service.ts` **恰 7 处**：`:416`（completeTask）/ `:521`（undoCompletion）/ `:955`（landSubmissionRecord）/ `:1032`（withdrawSubmission）/ `:1103`（withdrawCompletion）/ `:1157`（review approve）/ `:1193`（review reject）——**未新增** | ✅ |
| `withdrawCompletion` 切片禁忌字面量 | 切片 `[withdrawCompletion, reviewSubmission)` 内：`'cancelled'` → `false`；`pushNotification` → `false`；`db.notifications` → `false`；`reviewRequired: false` → `false` | ✅ |

---

## 6. 组件测试（B）真实性评价（第四层）

文件：`tests/audit-center-render.test.tsx`（4 用例，`react-test-renderer` + `act` + `jest.mock`，**真实**渲染 `AuditCenterScreen` 与真实 `utils/audit` 纯函数）。

| 用例 | 断言内容 | 是否真渲染 | 判定 |
| --- | --- | --- | --- |
| **T-1** 四栏标题与顺序 | `mainSegments(renderer).props.options.map(label)` **逐项 `toEqual(['待提报','待审核','审核通过','撤回审核'])`** + `toHaveLength(4)` | ✅ 断言标签**与顺序** | **真** |
| **T-2** 权限门禁 | manager ⇒ `findByLabel('审核').length > 0`；member ⇒ `toHaveLength(0)` **且** 任务标题仍可见（只读）；`useCan` 为**真实**权限矩阵（读 `AppProvider.role`，测试 mock 该 role） | ✅ **真区分两态**（变异 MB 证明守门禁） | **真** |
| **T-3** 空态文案随栏位 | 默认「待审核」栏含「没有待审核事项」→ 切「待提报」含「没有待提报事项」→ 切「撤回审核」含「没有驳回 / 撤回记录」 | ✅ **真断言文案变化** | **真** |
| **T-4** 门禁联动（缺陷 E） | 抽屉未开无阻断提示 → 开抽屉后含「评审子任务尚未完成，暂不可通过」+ 「提交审核」`accessibilityState.disabled===true`；**对照组**：移除未完成子任务后无提示 + `disabled===false` | ✅ **真断言禁用态 + 有对照组** | **真** |

**无「能 mount 就算过」的空壳用例。**

---

## 7. 主动追加探测（第五层）

| 探测点 | 实测 | 结论 |
| --- | --- | --- |
| **A 的清理点是否全覆盖** | `applyClearedReviewState` 调用点 = `moveTask:368` / `reopenTask:474` / `withdrawCompletion:1102`（+ `undoCompletion` 经 `resolveUndoReviewReset`→`Object.assign`）；4 点**全部**对应 `closeOpenReviewSubtasks`（`:369/:475/:529/:1105`） | ✅ 无遗漏 |
| **其他孤儿产生路径** | 评审子任务**仅**由 `completeTask`（needsReview 分支）经 `ensureReviewSubtask` 产生；`reviewRequired` 唯一写入点 = 创建期 + `applyClearedReviewState`（4 处）⇒ 4 处已全接入 | ✅ 无未覆盖路径 |
| **共享状态污染** | `audit-center.test.ts` / `increment4-qa.test.ts` 均 `beforeEach(() => resetDatabase())`；全部 **NO-RESET** 套件（`calendar-lane` / `schedule` / `seed-integrity` / `task-state-machine` / `draft` / `linking` / `permission` / `date` / `format` 等）**不调用任何任务变更 API、不读 `db.tasks`**；渲染测试 mock `@/services` 不碰真实 db | ✅ 无污染 |
| **看板列计数一致性** | 关闭后看板列任务总数 === `db.tasks` 中 `projectId` 匹配且非 `cancelled` 的数量（**12 === 12**） | ✅ |
| **`getProjectStats.progress`** | 关闭子任务后 `progress = 0.1667`（`doneCount 2 / taskCount 12`），在 `[0,1]` 内 | ✅ |
| **`listMyTodos` / `listTodayDue`** | 被关闭 child 不出现在任何列表；主任务撤回后回 `in_progress` 正常出现在两列表 | ✅ |
| **`TaskDetailScreen.canClaim`** | `:344-349` `canClaim = assigneeId===null && status!=='cancelled' && status!=='done' && status!=='pending_review'` ⇒ `pending_review` **防御性排除**，正确 | ✅ |

---

## 8. 存疑清单（4 项，均非阻塞，附建议处置）

### 存疑 1 · 「连调两次」在公开 API 上不可自然达（幂等性只能间接验证）

- **期望**：`closeOpenReviewSubtasks` 连调两次幂等。
- **实际**：`withdrawCompletion` 前置态要求 `submissionStatus==='pending'`，首次撤回后变为 `'withdrawn'` ⇒ **无法**对同一任务连续两次走撤回路径；`undoCompletion` 亦同理。我的探针用「人工把主任务重入 `pending_review` 再 `moveTask`」构造出第二次调用，验证了**第二次不再改动已 `cancelled` 的 child（version 不变）**。
- **判断**：幂等性的**实质（跳过 done/cancelled）已被探针覆盖**，但「字面连续两次调用」在公开 API 上不可达，属**测试可达性**而非缺陷。
- **建议处置**：**接受现状**，无需修复；若架构师希望显式锁死，可将 `closeOpenReviewSubtasks` 导出为 `@internal` 纯函数并加单元测试（非必需）。

### 存疑 2 · 关闭子任务未通知承接人

- **期望**：承接人的评审任务被「取消」时，是否应收到一条通知？
- **实际**：`closeOpenReviewSubtasks` **零通知**（设计如此，探针已证 `db.notifications` 长度/类型不变）。承接人的待办里那条「项目评审 — X」会**静默消失**。
- **判断**：与 team-lead 设计一致（`ARCH §2.4.2` 明确「零通知：仅状态变更」），且撤回/撤销本就有其它结果通知（`review.withdrawn` / `review.result`）。**非缺陷**，属产品取舍。
- **建议处置**：**保持零通知**（与增量 7 的 K24 精神一致）；若产品希望承接人知情，可另开小增量，不在本增量范围。

### 存疑 3 · 「每轮重建 child」导致 `cancelled` 子任务行数累积

- **期望**：反复「完成→撤回」不应无界累积数据。
- **实际**：因 C 明确**不复用 `cancelled`**，每轮会**新建**一条评审子任务，旧条保留为 `cancelled`。探针实测 3 轮后 `children = ['cancelled','cancelled','cancelled']`（3 条）。
- **判断**：这是 C 的**预期行为**（cancelled 不复用）与 A 的**预期行为**（关闭旧条）叠加的必然结果；`cancelled` 条**不进看板列、不进待办、不阻塞门禁**，仅占 `db.tasks` 内存行。演示环境可忽略。
- **建议处置**：**接受现状**；若未来数据量敏感，可考虑对 `cancelled` 评审子任务做物理清理或归档（超出本增量范围）。

### 存疑 4 · 撤回「审核轮回态」任务时也会关闭子任务

- **期望**：需确认 A 的触发口径在「审核轮回态」（`in_progress + submissionStatus:pending + reviewRequired:true`）下是否合理。
- **实际**：`withdrawCompletion` 的 `closeOpenReviewSubtasks` 是**无条件**调用（在 `applyClearedReviewState` 之后）。审核轮回态任务满足 `submissionStatus==='pending'` 前置，故撤回时**会**关闭其评审子任务。
- **判断**：**语义正确**——撤回 = 提报人主动撤回完成提报 ⇒ 评审需求被清除 ⇒ 关闭子任务一致（与 `undoCompletion` 的 `submissionStatus:null` 路径同语义）。**非缺陷**，仅记录该可达路径已被确认。
- **建议处置**：**接受现状**（无需改动）。

---

## 9. 结论

**通过。**

- 基线独立复跑：`tsc` exit 0、**40 套件 / 771 用例全绿**。
- **变异测试 6/6 全部命中**：M1→R-1、M2→R-6、M3→S-1、M4→S-2、M5→increment4-qa 收窄断言（5 条失败）、MB→T-2。**无橡皮图章**。
- **A / C / E / B 四类修复**经自建探针（17 例全绿）+ 静态审计逐项成立：四条清理路径全覆盖、cancelled 不复用、cancelled 不阻塞门禁、组件测试真渲染。
- 反向断言（驳回存活 + 复用、审核轮回态存活）与边界（幂等 / 无子任务 / 已 done / 多子任务）全部通过；**零通知**成立。
- 断言未被削弱；`submissionStatus =` 恰 7 处；`withdrawCompletion` 切片干净；收窄断言仍能捕获原缺陷。
- 无共享状态污染；看板 / 统计 / 列表一致性无新问题。
- 4 项存疑**均非阻塞**，建议全部**接受现状**（详见 §8）。

**最终判定：通过（附 4 项非阻塞存疑，建议接受现状）。**

---

## 附 · 临时探针清理声明

| 临时文件 | 用途 | 临时用例数 | 状态 |
| --- | --- | --- | --- |
| `tests/__qa71_tmp_probe.test.ts` | 孤儿消除两路 / 反向存活 / 幂等边界 / 零通知 / 列表一致性 | 14 | ✅ 已删 |
| `tests/__qa71_tmp_probe2.test.ts` | 看板 / 统计 / 列表一致性 / 多轮循环 | 3 | ✅ 已删 |

**清理核实**：`tests/` 目录无 `__qa71_tmp*` 残留（`grep -c` → `0`）；被变异测试临时改动的 3 个源文件（`task.service.ts` / `audit.ts` / `AuditCenterScreen.tsx`）**md5 与备份逐一相同**，`src/` **零净改动**；恢复后全量复跑回到 **40 / 771 全绿**。
