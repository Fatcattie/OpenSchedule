# QA 报告（增量 5）— OpenSchedule 移动端：提报 / 审核闭环补完

> 验证人：严过关（QA） · 日期：2026-09-27 · 轮次：**第 1 轮独立验证 + 智能路由判定**
> 判据：`PRD-mobile-increment-5.md` **v1.0**（需求池 17 / AC-01~AC-17 / INV-1~INV-12 / R6-1~R6-10）· `ARCH-mobile-increment-5.md` **v1.0**（T01~T05 / K27~K38 / §8 回归矩阵 33 行 / §9 授权改动清单）
> 被验对象：工程师寇豆码自评 `IS_PASS: YES` 的增量 5 实现（**修改 5 源码 + 修改 2 授权测试 + 新增 1 测试**）
> 独立复跑者：主理人齐活林（已确认交付态 34 套件 / 617 用例，唯一失败 = `increment3-qa.test.ts:103`；QA 本轮**不采信**，全部重新实测）

---

## 0. TL;DR

| 项 | 结论 |
| --- | --- |
| **源码正确性** | ✅ **零缺陷**。B1（包装函数 `withdrawCompletionAndNotify`）/ B2（`withdrawSubmission` 加 `isSubmissionRecord` 守卫）/ B3（`SUBMISSION_TRANSITIONS` 修正 + `assertSubmissionTransition` 唯一守卫 + 7 处接入）/ B4（`domain.ts` 注释补全）**四处变更全部按 ARCH 落地**，逐条与文档一致 |
| **AC 通过率** | **17 / 17 = 100%**（AC-01~AC-17 全 PASS） |
| **INV 通过率** | **12 / 12 = 100%**（INV-1~INV-12 全 PASS） |
| **回归** | ✅ `npx tsc --noEmit` → **exit 0**；`npx jest --config jest.config.js` → **35 套件 / 668 用例全绿**（工程师交付态 34 / 617，其中 1 套件失败；QA 修复 1 处 + 新增 1 套件 / 51 用例） |
| **🔴 K38 定义顺序** | ✅ **成立**：`withdrawCompletion`（:1018）< `reviewSubmission`（:1076）< `withdrawCompletionAndNotify`（:1169）；2 处受保护切片断言（`increment4-qa:551-572` / `increment4-withdraw:342-354`）**仍绿**（QA 独立复刻判定式亦通过） |
| **撤回失败不发通知** | ✅ **成立**：40302（主体不符）/ 40901（陈旧版本）/ 40401（不存在）三态下 `db.notifications` **逐字节相等**、`auditFeed` 长度不变 |
| **接收人 = 撤回前快照** | ✅ **成立**：2 位审核人 ⇒ 恰好这 2 人各 1 条；撤回后 `reviewerIds === []`（证明不依赖清理后的值） |
| **7 处守卫接入点逐条回归** | ✅ **成立**：W1/W2/W4/W5/W6/W7/W8 七条链路**全部不抛错**（用与工程师不同的任务 id 独立复跑） |
| **既有断言未被修改（除授权 3 处）** | ✅ **成立**（mtime + 内容双重证据，见 §9） |
| **问题清单** | P0 × 0、P1 × 0、P2 × 0、P3 × 7（观察 / 登记项，均非缺陷） |
| **智能路由判定** | 🟢 **NoOne** —— 源码零缺陷 + 全绿（35 / 668）。唯一红过的用例 = **QA 自己在增量 3 写的时刻相关断言**（测试代码自身 Bug），已按授权在**本轮（任务 B）自修**并闭环 |

**一句话**：**实现是对的，可以验收**。工程师的 `IS_PASS: YES` 与「唯一失败 = `increment3-qa.test.ts` 时刻相关、非本次回归」声明**经独立实测成立**；该失败属**测试代码自身 Bug**（QA 侧），已由 QA 在任务 B 中按窄边界修复为**时刻鲁棒**，语义（「朴素相加严格大于并集 ⇒ 证明去重生效」）**仍确定性地成立**。

---

## 1. 验证环境

| 项 | 值 |
| --- | --- |
| 工作目录 | `d:\GLMclaw\workspace\openschedule\apps\mobile` |
| 运行时刻 | 2026-09-27 23:12 ~ 23:25（Asia/Shanghai，`date` 实测 `Sun Sep 27 23:12:43 GMT+0800 2026`） |
| 运行时 | Expo 57 / RN 0.86.3 / React 19 / TS 6 / Jest 29（`jest-expo` preset） |
| 命令 | `npx tsc --noEmit` · `npx jest --config jest.config.js`（**用 `npx`，未用 `pnpm`**） |
| 数据态 | 每个用例 `beforeEach(() => resetDatabase())`（内存库复位到种子） |
| 源码改动 | **QA 未修改 `src/` 下任何文件**（铁律遵守；`find src -newermt 23:10` 零命中）；仅新增 `tests/increment5-qa.test.ts` + 授权修 `tests/increment3-qa.test.ts` |
| 依赖 | **零新增**（`package.json` mtime 停留 `2026-09-13 00:52`）；`grep -rn "reanimated\|gesture-handler" src/` → **无命中**（exit 1） |

---

## 2. 交付声明复核（独立复跑，不采信）

| 工程师声明 | QA 独立复核 | 结论 |
| --- | --- | --- |
| `tsc` exit 0 | 实测 `tsc exit=0` | ✅ 一致 |
| 修改源码 5 / 授权改测试 2 / 新增测试 1（31 用例） | mtime 实读：源码 5 个 mtime `22:54:51`~`23:03:35`；`submission-flow.test.ts` / `increment4-qa.test.ts` mtime `22:57`；`increment5-closure.test.ts` mtime `22:58` | ✅ 一致 |
| **34 套件 / 617 用例，33 套件全绿，唯一失败 = `increment3-qa.test.ts`（既有 wall-clock 相关）** | 实测首跑：`Test Suites: 1 failed, 33 passed, 34 total / Tests: 1 failed, 616 passed, 617 total`；失败点 = `increment3-qa.test.ts:103`（`expect(naive).toBeGreaterThan(union.length)` 收到 `10`、期望 `> 10`） | ✅ **完全一致** |
| 该失败「非本次回归、属既有 wall-clock 相关」 | **独立归因**：`naive = due(5) + review(4) + approaching(1) = 10`，`union = 10`；深夜 `now=23:12` 时 `listDeadlineApproaching` 窗口 `[now−1h, now+24h] = [22:12, 明 23:12]` ⇒ 种子 `task-014`（今 19:00）/ `task-015`（今 17:00）**漂出窗口** ⇒「临期预警 ∩ 待我审核」重叠消失 ⇒ 前提不成立 | ✅ **归因成立**（详见 §8） |
| 1 条偏差上报 | 本轮未发现其它偏差（AC 17 + INV 12 逐条实测） | ✅ 成立 |

> **说明（行号口径）**：任务书 / PRD / ARCH 中「7 处赋值点 = `:345`/`:431`/`:850`/`:920`/`:985`/`:1026`/`:1057`」为 **PRD 写作基线（增量 4 交付态）** 的行号；本增量因**新增导入 + `assertSubmissionTransition` 助手（约 +45 行）**，实际赋值点已平移到 `:391`/`:482`/`:904`/`:981`/`:1051`/`:1094`/`:1127`（**仍恰 7 处**）。此为文档基线滞后，非缺陷（登记 §10-P3-1）。

---

## 3. 逐条 AC 结果表（AC-01 ~ AC-17）

| AC | 结论 | 证据（独立断言 / 实读位置） |
| --- | --- | --- |
| **AC-01**<br>撤回成功 ⇒ 每位审核人各 1 条 `review.withdrawn` | ✅ **PASS** | `withdrawCompletionAndNotify('task-014',{actorId:提报人李娜})` ⇒ 通知 **+1**；`type='review.withdrawn'`、`userId=user-001`、`readAt=null`、`status='sent'`、`channel='in_app'`、`data.taskId='task-014'`、`title='提报已撤回'`、`body` 含 `'完成提报：首页原型评审'` 与 `'无需审核'`；返回体 `submissionStatus='withdrawn'`、`status='in_progress'`、`reviewerIds=[]` |
| **AC-02**<br>接收人 = 撤回**前**的 `reviewerIds`（时序） | ✅ **PASS** | `task-015` 人为扩为 `[user-001,user-004]` ⇒ 新增通知接收人集合 **=== 撤回前快照**（2 条）；撤回后 `findTask('task-015').reviewerIds === []`（证明不依赖清理后的值） |
| **AC-03**<br>撤回失败 ⇒ 零通知、零副作用 | ✅ **PASS** | ① 主体不符（`actorId=user-001`）⇒ `40302`；`JSON.stringify(db.notifications)` **逐字节相等**、`auditFeed.length` 不变、`submissionStatus` 仍 `pending`、`version` 不变；② 陈旧 `version` ⇒ `40901`，通知逐字节相等；③ 不存在 id ⇒ `40401`，通知逐字节相等 |
| **AC-04**<br>`withdrawCompletion` 函数体仍零通知（K24 边界不变） | ✅ **PASS** | 切片 `[indexOf('export async function withdrawCompletion'), indexOf('export async function reviewSubmission'))` ⇒ `not.toContain('pushNotification')` / `('pushNotificationOnce')` / `('db.notifications')`（= L1/L2 原样通过）；行为级 `JSON.stringify(db.notifications)` 前后逐字节相等（= L3/L4） |
| **AC-05**<br>未读级去重（`pushNotificationOnce`） | ✅ **PASS** | **自然序列**：撤回（user-001 得 1 条未读）→ `completeTask`（`reviewerIds=[user-001,user-004]`）→ 再撤回 ⇒ `review.withdrawn` 总 2 条、**user-001 仍 1 条**（去重命中）、user-004 1 条（新写）；**readAt 变体**：首条置已读 ⇒ 再派发**成功** |
| **AC-06**<br>三处映射同步 | ✅ **PASS** | ① `NOTIFICATION_EVENT_LABEL['review.withdrawn']==='撤回提醒'`；② `NotificationsScreen.tsx` 含 `'review.withdrawn': 'corner-up-left'`；③ `domain.ts:98` 注释同时含 `review.withdrawn` 与既有全部 7 项。**Feather glyphMap 实读**：287 字形，`corner-up-left` **存在**；`undo`/`reply`/`ban` **不存在**（佐证选型） |
| **AC-07**<br>注释补全不破坏既有断言 | ✅ **PASS** | `find(line => line.includes('task.assigned / mention / deadline_approaching'))` 命中**单行**，含 `review.pending` 与 `review.withdrawn`；该行以 `/**` 起、`*/` 止（单行约束 K32/K36 满足）；`increment3-dedup-notify.test.ts:466-473` 套件**仍绿** |
| **AC-08**<br>正式任务不可经 `withdrawSubmission` 撤回 | ✅ **PASS** | `task-014` / `task-015`（`isSubmissionRecord===false`）⇒ `40302`；`status`/`submissionStatus`/`version` **零变化**（未被写成 `cancelled`） |
| **AC-09**<br>提报记录路径零回归 | ✅ **PASS** | `submitItem` 记录：本人撤回 ⇒ `withdrawn`+`cancelled`+`version+1`；非本人 ⇒ `40302`；非 `pending`（撤回后再撤）⇒ `40302`；`submission-flow.test.ts:240-263` 三条用例**全绿** |
| **AC-10**<br>表内容 = 真实可写入集合 | ✅ **PASS** | `SUBMISSION_TRANSITIONS` 与修正值逐键相等；`canTransition('approved'\|'rejected'\|'withdrawn','pending')===true`；6 条非法组合**仍为假**（`draft→approved` / `pending→draft` / `pending→published` / `approved→rejected` / `rejected→approved` / `withdrawn→approved`） |
| **AC-11**<br>守卫接入且零行为变更（7 链路全绿） | ✅ **PASS** | W1 `completeTask`（`from=undefined`）/ W2 `undoCompletion`（`approved→pending`）/ W4 `landSubmissionRecord`（`pending→approved`）/ W5 `withdrawSubmission`（`pending→withdrawn`）/ W6 `withdrawCompletion`（清理前快照 `pending`）/ W7 `reviewSubmission approve` / W8 `reviewSubmission reject` —— **七条全部不抛错**（QA 用 `task-006/015/005/014` 等独立任务复跑） |
| **AC-12**<br>幂等重写放行（`to===from`） | ✅ **PASS** | `task-014`（`in_progress+pending`）+ `completeTask` ⇒ **不抛错**、`submissionStatus==='pending'`、`status==='done'`、`reviewerIds===allManagerIds()` |
| **AC-13**<br>清理包不经守卫 | ✅ **PASS** | ① `undoCompletion(...,{submissionStatus:null})` ⇒ 不抛错 + 六字段全清；② `moveTask` 离开 `done` ⇒ 不抛错 + 六字段全清；③ `withdrawCompletion` 内部「先复位 `null` 再覆写 `withdrawn`」⇒ 不抛错 |
| **AC-14**<br>守卫是唯一入口（源码级计数） | ✅ **PASS** | `TASK_SRC.matchAll(/submissionStatus = [^=]/g)` **恰 7 处**（`:391/:482/:904/:981/:1051/:1094/:1127`），每处**前 200 字符窗口**均含 `assertSubmissionTransition(`；反向：`applyClearedReviewState` 切片**不含**守卫调用（复位豁免） |
| **AC-15**<br>`withdrawn → pending` 覆盖（M6-P1-01） | ✅ **PASS** | `withdrawCompletionAndNotify('task-014')` ⇒ `withdrawn`；再 `completeTask` ⇒ `pending` + `done`；`listPendingReview('user-001')` **重新包含** `task-014` |
| **AC-16**<br>三函数口径未变（回归锚点） | ✅ **PASS** | 种子态 `listTodayDue` **精确 5 条** `{001,004,005,016,017}`；`task-014/015` **不在** due、**在** `listPendingReview`；两集**交集为空**；`task-014`（`dueAt` 锚定 24h 窗内）**在** `listDeadlineApproaching`；源码级两函数过滤条件逐条在位 |
| **AC-17**<br>② 语义归因入注释（零行为） | ✅ **PASS** | `listTodayDue` 体含 `审核轮回态` 归因注释（`task.service.ts:205-207 / 220-222`）；`readFileSync` 类断言仅 `toContain` ⇒ 追加注释不破坏（`increment4-qa.test.ts:620-628` 仍绿） |

---

## 4. INV 结果表（INV-1 ~ INV-12）

| INV | 结论 | 证据 |
| --- | --- | --- |
| **INV-1**<br>`withdrawCompletion` 函数体零通知 | ✅ **PASS** | 切片不含 `pushNotification`/`pushNotificationOnce`/`db.notifications`；直接调用前后 `db.notifications` 逐字节相等 |
| **INV-2**<br>接收人 ⊆ 撤回前 `reviewerIds`（K18 同源） | ✅ **PASS** | 新增通知 `userId` 集合 === 撤回前快照集合（2 位审核人双向验证）；`isWithdrawable` 分叉主体（completion=`assigneeId`，task=`createdBy`）独立复验 |
| **INV-3**<br>撤回失败 ⇒ 零通知 + 零 audit + 零字段变更 | ✅ **PASS** | 40302 / 40901 / 40401 三态均验证通知逐字节相等；40302 追加验证 `auditFeed.length` 与 `version` 不变 |
| **INV-4**<br>`pending` ⇒ `reviewRequired===true` 且 `reviewerIds` 非空 | ✅ **PASS** | 全量遍历 `db.tasks` 中 `submissionStatus==='pending'` 者（`task-014/015/019/020`）逐条满足 |
| **INV-5**<br>`completedAt != null ⟺ status==='done'` | ✅ **PASS** | 全量遍历 `db.tasks` **零违例** |
| **INV-6**<br>表 ⟺ 真实可写入集合；表中不含自环 | ✅ **PASS** | 表逐键相等；遍历表 `expect(targets).not.toContain(from)` 全通过（自环由守卫放行，不进表） |
| **INV-7**<br>每次状态变化必经守卫（唯一守卫） | ✅ **PASS** | AC-14 源码计数（7 处 + 窗口判定）+ 7 链路零回归；**反向证明**：`approved→rejected` 非法变化 ⇒ `40302`（守卫真拦截） |
| **INV-8**<br>清理包（`null`）不经 `canTransition` | ✅ **PASS** | `applyClearedReviewState` 切片无守卫调用；`undoCompletion(null)` / `moveTask` 离开 `done` / `withdrawCompletion` 三条复位路径均不抛错 |
| **INV-9**<br>去重三元组 = (`userId`,`type`,`data.taskId`) + 未读判定 `readAt===null` | ✅ **PASS** | 三元组逐维区分各自写入；相同三元组 ⇒ `null`（去重）；已读 ⇒ 再写成功（`readAt` 判定，非 `status`） |
| **INV-10**<br>除授权处外既有断言逐字节不变；既有套件全绿 | ✅ **PASS** | 全量 **35 套件 / 668 用例全绿**；授权 3 处已核对、邻近断言与标题未改（§7）；mtime 证据（§9） |
| **INV-11**<br>提报记录不进正式列表，仅进「待我审核 / 我的提报」 | ✅ **PASS** | `submitItem` 记录（`dueAt` 今日 + `startAt` 今日）**不在** `listTodayDue` / `listDeadlineApproaching` / `listMyTodos` / `listScheduledTasks`，**在** `listPendingReview` |
| **INV-12**<br>撤回提报永不写 `cancelled`；撤回新事项提报必写 `cancelled` | ✅ **PASS** | `withdrawCompletion('task-014')` ⇒ `status!=='cancelled'`；`withdrawSubmission(记录)` ⇒ `status==='cancelled'` |

---

## 5. 重点攻击结论

### (A) 🔴 K38 定义顺序（本增量最易踩的坑）

| 攻击点 | 实测结果 | 判定 |
| --- | --- | --- |
| **定义顺序** | `indexOf('export async function withdrawCompletion')=1018` **<** `indexOf('...reviewSubmission')=1076` **<** `indexOf('...withdrawCompletionAndNotify')=1169` | ✅ **成立** |
| **受保护切片（L1/L2 复刻）** | 切片 `[1018, 1076)` **不含** `pushNotification` / `pushNotificationOnce` / `db.notifications` / `withdrawCompletionAndNotify` ⇒ 包装函数体（含 `pushNotificationOnce`，含子串 `pushNotification`）**未落入**切片 | ✅ **成立** |
| **2 处切片断言仍绿** | `increment4-qa.test.ts:551-572`（套件 PASS）+ `increment4-withdraw.test.ts:342-354`（套件 PASS）；QA 独立复刻判定式亦通过 | ✅ **成立** |
| **`withdrawSubmission` 切片（:598-605）** | 切片 `[withdrawSubmission, 'export interface WithdrawCompletionInput')` 仍含 `task.createdBy !== actorId` 与 `task.status = 'cancelled'`（新增守卫**未移除**这两行） | ✅ **成立** |
| **公开桶可达** | `taskService.withdrawCompletionAndNotify`（`@/services`）与 `@/services/task.service` 直连均为 `function`（屏幕产品入口） | ✅ **成立** |

### (B) 撤回失败不发通知 / 接收人 = 撤回前快照 / 去重

| 攻击点 | 实测结果 | 判定 |
| --- | --- | --- |
| **失败不发通知** | 40302（主体不符）⇒ 通知**逐字节相等**、audit 不变、字段不变；40901（陈旧 version）⇒ 通知逐字节相等；40401（不存在）⇒ 通知逐字节相等 | ✅ **成立** |
| **接收人 = 撤回前快照** | `task-015` 扩为 `[user-001,user-004]` ⇒ 恰 2 条、接收人集合 === 快照；撤回后 `reviewerIds===[]`（若在 `applyClearedReviewState` 之后读取必为空 ⇒ 快照时序正确） | ✅ **成立** |
| **去重（自然序列）** | 撤回 → `completeTask`（reviewerIds 扩为 2 人）→ 再撤回：`review.withdrawn` 总 2 条，**user-001 仍 1 条**（旧条未读 ⇒ 去重跳过），user-004 1 条（首写） | ✅ **成立** |
| **去重（readAt 判定）** | 首条 `readAt=null` ⇒ 同三元组派发返回 `null`；置已读 ⇒ 再派发成功 | ✅ **成立** |

### (C) 7 处守卫接入点逐条回归（最大回归面）

| 接入点 | 函数 | 实测（独立任务） | 判定 |
| --- | --- | --- | --- |
| W1 | `completeTask` | `task-006`（`in_progress`，`from=undefined`）⇒ `done+pending`，不抛错 | ✅ |
| W2 | `undoCompletion` | `task-015` 先 `approve`（`approved`）⇒ `undoCompletion(...,'pending')` 不抛错、`reviewRequired` 保持 `true`（K3） | ✅ |
| W4 | `landSubmissionRecord` | `submitItem(kind:'task', ME)` ⇒ `approved`+`cancelled` | ✅ |
| W5 | `withdrawSubmission` | `submitItem` 记录 ⇒ `withdrawn`+`cancelled` | ✅ |
| W6 | `withdrawCompletion` | `task-005` 先完成 ⇒ `withdrawCompletion`（清理前快照 `from='pending'`）⇒ `withdrawn`+`in_progress` | ✅ |
| W7 | `reviewSubmission`(approve) | `task-014` ⇒ `approved`+`done` | ✅ |
| W8 | `reviewSubmission`(reject) | `task-015` ⇒ `rejected` | ✅ |

> **另**：`increment4-qa` / `increment4-withdraw` / `increment2-completion` / `increment2-qa` / `round2-regression` / `services` 六个「需重点复跑」套件**全部 PASS**（覆盖 `rejected→pending` / `approved→pending` 等历史链路）。

### (D) 幂等豁免 / `from==null` 仅放行 `pending`

| 攻击点 | 实测结果 | 判定 |
| --- | --- | --- |
| **`to === from` 幂等** | `task-014`（`pending`）+ `completeTask` ⇒ `pending→pending` **放行**（不抛错）；表中**无自环** | ✅ **成立** |
| **`from == null` 仅放行 `pending`** | 经 `undoCompletion` 公开入口（`task-007`：`done`+`submissionStatus=undefined`）：`to='pending'` ⇒ **放行**（结果 `pending`）；`to='approved'` ⇒ **抛 40302**（正反双向） | ✅ **成立** |
| **守卫真拦截** | `task-014` 先 `approve`（`approved`）⇒ `undoCompletion(...,'rejected')` ⇒ `40302`（`approved→rejected` 非法） | ✅ **成立** |
| **清理包豁免** | `applyClearedReviewState` 切片无守卫调用；`null` 复位三路径不抛错 | ✅ **成立** |

---

## 6. 回归结果（原始命令输出）

### 6.1 类型检查

```
$ npx tsc --noEmit
tsc exit=0
```

### 6.2 全量测试（QA 交付最终态）

```
$ npx jest --config jest.config.js
Test Suites: 35 passed, 35 total
Tests:       668 passed, 668 total
Snapshots:   0 total
Time:        46.708 s
```

### 6.3 套件 / 用例数演进

| 阶段 | 套件 | 用例 | 失败 |
| --- | --- | --- | --- |
| 增量 4 交付态（ARCH-4 基线） | 33 | 586 | 0 |
| **工程师增量 5 交付态** | **34** | **617** | **1**（`increment3-qa.test.ts:103`，时刻相关） |
| **QA 交付态（本轮）** | **35** | **668** | **0** |
| QA 变更 | +1（`increment5-qa.test.ts`，51 用例） | +51 | 修 1（`increment3-qa` 时刻鲁棒） |

### 6.4 关键套件复跑（原始输出）

```
PASS tests/increment5-closure.test.ts        （工程师新增，全绿）
PASS tests/increment4-qa.test.ts             （含 K38 切片 :551-572 + 授权表 :511-521）
PASS tests/increment4-withdraw.test.ts       （含 K38 切片 :342-354）
PASS tests/increment3-dedup-notify.test.ts   （含 domain.ts:98 注释子串 :466-473）
PASS tests/submission-flow.test.ts           （含授权 :76）
PASS tests/increment2-completion.test.ts / increment2-qa.test.ts / round2-regression.test.ts
PASS tests/services.test.ts
PASS tests/increment3-qa.test.ts             （任务 B 修复后 22/22）
PASS tests/increment5-qa.test.ts             （QA 新增 51/51）
```

---

## 7. 授权改动边界复核结论

> 判据：`ARCH-mobile-increment-5.md §9`（唯一授权 3 条 expect）+ K37 铁律。**逐条核对是否越界**。

### 7.1 三条授权 expect —— 是否越界

| # | 位置 | 授权 before → after | 实读现况 | 是否越界 |
| --- | --- | --- | --- | --- |
| 1 | `tests/submission-flow.test.ts:76` | `canTransition('approved','pending')).toBe(false)` → **`.toBe(true)`** | ✅ 现为 `.toBe(true)`（且全仓**无** `.toBe(false)` 残留） | **未越界** |
| 2 | `tests/increment4-qa.test.ts:515-517` | `approved: []`→`['pending']`；`rejected: ['draft']`→`['draft','pending']`；`withdrawn: ['draft']`→`['draft','pending']` | ✅ 三行现为授权终值 | **未越界** |
| 3 | `tests/increment4-qa.test.ts:520` | `canTransition('approved','pending')).toBe(false)` → **`.toBe(true)`**（注释保留） | ✅ 现为 `.toBe(true) // 受保护断言同向`（注释逐字保留） | **未越界** |

> **量化证据**：全仓 `canTransition('approved', 'pending'))` 的断言**恰 3 处**（`submission-flow:76` / `increment4-qa:520` / `increment5-closure:206`），**全部为 `true`**，无 `false` 残留。

### 7.2 邻近断言未变证明（内容级，逐条实读）

**`tests/submission-flow.test.ts`**

| 位置 | 应保持 | 实读 | 结论 |
| --- | --- | --- | --- |
| `:63-69`（7 条**合法**迁移） | 全为 `true` | `draft→pending` / `draft→published` / `pending→approved` / `pending→rejected` / `pending→withdrawn` / `rejected→draft` / `withdrawn→draft` **七条均 `.toBe(true)` 在位** | ✅ 未改 |
| `:73/:74/:75/:77/:78/:79`（6 条**非法**迁移） | 全为 `false` | `draft→approved` / `pending→draft` / `pending→published` / `approved→rejected` / `rejected→approved` / `withdrawn→approved` **六条均 `.toBe(false)` 在位** | ✅ 未改 |
| `:76`（授权处） | `.toBe(true)` | 已改（唯一） | ✅ 授权内 |

**`tests/increment4-qa.test.ts`**

| 位置 | 应保持 | 实读 | 结论 |
| --- | --- | --- | --- |
| `:513-514`（`draft` / `pending` 两项） | 不变 | `draft: ['pending','published']`、`pending: ['approved','rejected','withdrawn']` 在位 | ✅ 未改 |
| `:519`（`pending→withdrawn`） | `.toBe(true)` | `expect(canTransition('pending', 'withdrawn')).toBe(true)` 在位 | ✅ 未改 |
| `:512` / `:518` / `:521`（`expect(...)` / `})` / `})`） | 不变 | 结构行在位 | ✅ 未改 |
| `:549-605`（源码切片）/ `:610-638`（AC-14 锚点）/ `:643-678`（`runTransition` 切片） | 全部不变 | 全量套件 PASS，源码级断言逐条命中 | ✅ 未改 |

### 7.3 标题是否被改

| 标题 | 位置 | 现况 | 结论 |
| --- | --- | --- | --- |
| `describe('SUBMISSION_TRANSITIONS —— 全组合合法 / 非法')` | `submission-flow.test.ts:61` | 逐字在位 | ✅ **未改** |
| `it('合法迁移')` / `it('非法迁移')` | `submission-flow.test.ts:62/:72` | 逐字在位 | ✅ **未改** |
| `it('INV-8：SUBMISSION_TRANSITIONS 表内容未改（…）')` | `increment4-qa.test.ts:511` | 逐字在位（**注意**：标题仍含「表内容未改 / approved 终态」，与新内容不再匹配 ⇒ 已由 ARCH §11-A3 登记为外观瑕疵，主理人裁定**不改标题**） | ✅ **未改** |

> **结论**：授权改动**严格限于 3 条 expect**，**未越界**；两文件内其它断言一字未改、标题未改。

---

## 8. 任务 B —— `tests/increment3-qa.test.ts` 时刻鲁棒修复（已获授权，窄边界）

### 8.1 改了什么（before → after）

**唯一改动**：在 `it('种子态：三组 id 清单与并集基数 = 10')`（`:59`）的**开头**插入 2 行「锚定 `dueAt`」+ 8 行说明注释（共 +10 行），**未改动该用例内任何断言、未删除任何断言、未改任何 `it`/`describe` 标题**。

| 项 | before | after |
| --- | --- | --- |
| 关键断言 | `:103  expect(naive).toBeGreaterThan(union.length)` | `:113`（行号因插入 +10 行平移，**断言文本逐字不变**） |
| 前置（新增） | —— | `findTask('task-014')!.dueAt = demoDayAt(0, 23, 59)`<br>`findTask('task-015')!.dueAt = demoDayAt(0, 23, 59)` |
| 语义 | 「朴素相加严格大于并集 ⇒ 证明去重生效」 | **完全保留**（不变） |

**修复原理**：该去重证明**依赖**「临期预警 ∩ 待我审核」的重叠（`task-014`/`task-015`）。二者种子 `dueAt` 为「当日 17:00 / 19:00」，深夜运行时漂出 `listDeadlineApproaching` 的滑动窗口 `[now−1h, now+24h]` ⇒ 重叠消失 ⇒ `naive === union`。把二者锚定到「当日 23:59」⇒ 与 `now` 的时差恒 ∈ `(0, 24h]` ⇒ **确定性地**落在窗口内。**姿势与先例一致**（本文件 `:316` 的 K15 用例 + 姊妹文件 `increment3-dedup-notify.test.ts` 均已用「锚定 `dueAt` 消除时刻漂移」）。

### 8.2 当前真实时刻复跑

```
$ npx jest --config jest.config.js tests/increment3-qa.test.ts
Test Suites: 1 passed, 1 total
Tests:       22 passed, 22 total
```
（修复前：`1 failed / 21 passed`，失败点 `:103`）

### 8.3 模拟时刻复跑（不再漂移）

用临时套件（`jest.useFakeTimers` + `jest.setSystemTime`）在 6 个模拟时刻复算同一逻辑，**全部通过**：

| 模拟时刻（Asia/Shanghai） | `naive` | `union` | `naive > union` |
| --- | --- | --- | --- |
| 当日 00:00 | 16 | 9 | ✅ |
| 当日 08:00 | 16 | 9 | ✅ |
| 当日 12:00 | 17 | 10 | ✅ |
| 当日 15:00 | 17 | 10 | ✅ |
| 当日 22:00 | 14 | 10 | ✅ |
| 当日 23:00 | 13 | 10 | ✅ |

> 临时套件仅用于验证，**已在验证后删除**，不作为交付物。**该文件其它断言语义未动**：`:116` 的「时间相关性实证」（fake timers @08:00）与其余 21 条用例**全部仍绿**。

---

## 9. 既有断言未被修改（mtime + 内容双重证据）

### 9.1 mtime 窗口证据

| 文件 | mtime | 说明 |
| --- | --- | --- |
| 增量 5 源码施工窗口（5 文件） | `22:54:51` ~ `23:03:35` | 工程师 |
| `tests/submission-flow.test.ts` | `22:57:43` | 工程师（**授权**） |
| `tests/increment4-qa.test.ts` | `22:57:54` | 工程师（**授权**） |
| `tests/increment5-closure.test.ts` | `22:58:53` | 工程师（**新增**） |
| `tests/increment4-withdraw.test.ts` | `22:05:39` | **未在增量 5 触碰** |
| `tests/increment3-dedup-notify.test.ts` | `19:01:19` | **未触碰** |
| 其余既有套件（含 `increment2-*` / `round2-regression` / `services` / `seed-*` …） | ≤ `17:03:30` | **未触碰** |
| `tests/increment3-qa.test.ts` | `23:17:34` | **QA（任务 B，授权）** |
| `tests/increment5-qa.test.ts` | `23:21:19` | **QA（新增）** |

> 既有 33 套件中，除授权改的 `submission-flow` / `increment4-qa`（`22:57`）外，**最新 mtime ≤ `22:05:39`**，全部早于增量 5 施工窗口（`22:54` 起）⇒ **无任何其它既有测试文件在增量 5 期间被写入**。

### 9.2 内容逐条比对证据（红线断言逐字在位）

| 红线断言 | 位置 | 实读 |
| --- | --- | --- |
| 7 条合法迁移全 `true` / 6 条非法全 `false` | `submission-flow.test.ts:63-69 / :73-79` | ✅ 逐字在位（§7.2） |
| `SUBMISSION_TRANSITIONS` 整表 `toEqual` + `:519` | `increment4-qa.test.ts:512-519` | ✅ 在位（仅 3 值按授权改） |
| `domain.ts:98` 注释子串 `task.assigned / mention / deadline_approaching` + `review.pending` | `increment3-dedup-notify.test.ts:466-473` | ✅ 命中单行，两子串在位 |
| `dueToday` 精确 5 条 | `increment3-qa.test.ts:79` | ✅ 在位 |
| K15 有意差异（`pending` 离开今日到期仍在临期预警） | `increment3-qa.test.ts:316` | ✅ 在位 |
| `withdrawCompletion` 零通知切片（L1/L2） | `increment4-qa.test.ts:551-572` / `increment4-withdraw.test.ts:342-354` | ✅ 套件全绿 |

> **双重证据结论**：除**授权 3 条 expect**（`submission-flow:76` / `increment4-qa:515-517,520`）与 **QA 任务 B**（`increment3-qa` 锚定 `dueAt`）外，**既有断言零改动**（mtime 未触 + 红线断言逐字在位 + 全量全绿）。

---

## 10. 问题清单

| # | 级别 | 位置 | 问题 | 证据 | 处置建议 |
| --- | --- | --- | --- | --- | --- |
| **P3-1** | P3 | PRD/ARCH 行号 vs 实际 | 文档中「7 处赋值点 = `:345`…」为 PRD 写作基线（增量 4 交付态）行号；本增量因新增导入 + 守卫助手（约 +45 行），实际已平移为 `:391/:482/:904/:981/:1051/:1094/:1127` | 实测 `grep -n "submissionStatus = "` | **非缺陷**（文档基线滞后）。建议下一增量同步文档行号锚点 |
| **P3-2** | P3 | `submission-flow.test.ts:72` | `it('非法迁移')` 标题与新内容（`approved→pending` 现为合法）不再匹配 | 实读 | **不改**（标题未授权，ARCH §11-A3 / §12-16 已登记，语义零损失） |
| **P3-3** | P3 | `increment4-qa.test.ts:511` | `it('INV-8：SUBMISSION_TRANSITIONS 表内容未改（… approved 终态）')` 标题含「表内容未改 / approved 终态」，与修正后内容不符 | 实读 | **不改**（标题未授权，同上） |
| **P3-4** | P3 | `increment3-qa.test.ts:59` | 标题「并集基数 = 10」在 08:00 等时刻实际为 9（描述性，非断言） | §8.3 模拟时刻表 | **不改**（未在授权范围；描述性标题，断言本身已时刻鲁棒） |
| **P3-5** | P3 | `task.service.ts` 包装函数 | 「撤回 → 重新提报 → 再撤回」时，第二条撤回通知因**首条未读**被 `pushNotificationOnce` 去重跳过（无法区分第几轮） | §5(B) 自然序列实测 | **非缺陷**（PRD §7-3 / Q6-6 已登记；审核人未读提醒未丢失） |
| **P3-6** | P3 | `task.service.ts` | 撤回后**已发出的** `review.pending` 不回收 ⇒ 通知列表可能同时存在「待你审核」与「提报已撤回」 | 源码实读（N8） | **非缺陷**（增量 3 Q4-3 / PRD §7-4 已登记） |
| **P3-7** | P3 | `review.withdrawn` | 无 `notification_preferences` 偏好开关 | `seed-extra.ts` 仅 4 条偏好；写入路径不读偏好 | **非缺陷**（PRD §7-5 / Q6-7 已登记，所有类型恒走 `in_app`） |

> **P0 × 0 / P1 × 0 / P2 × 0**：未发现任何源码缺陷或阻断项。任务 B 的 `increment3-qa` 修复为**授权范围内**的测试代码自修，不计入问题清单（已闭环）。

---

## 11. 智能路由判定

### 🟢 **NoOne**（全部通过）

| 判据 | 结果 |
| --- | --- |
| **源码是否有 Bug？** | **无**。B1（包装函数）/ B2（`withdrawSubmission` 守卫）/ B3（表修正 + 唯一守卫 + 7 接入）/ B4（注释补全）四处变更逐条实测通过；17 AC + 12 INV **全 PASS**；对抗性攻击（K38 / 失败不发通知 / 接收人快照 / 7 守卫 / 幂等 / `from==null`）**均未击穿** |
| **测试代码自身是否有 Bug？** | 有 1 处（**QA 自己在增量 3 写的**时刻相关断言 `increment3-qa.test.ts:103`），按「测试代码自身有 Bug ⇒ QA 自修」路由规则，**已在本轮任务 B 按授权窄边界修复**（时刻鲁棒，语义不变） |
| **全量回归** | `tsc` exit 0；**35 套件 / 668 用例全绿**；既有断言（除授权 3 处 + 任务 B）零改动 |

**结论**：无需将任何问题路由回 **Engineer**。唯一红过的用例属 **QA 侧自修**范畴且已闭环。第 1 轮即收敛，**不进入第 2 轮**（未使用第 2 轮配额）。

> **对工程师交付物的独立结论**：`IS_PASS: YES` 与「唯一失败 = 既有 wall-clock 相关、非本次回归」声明 **经独立实测成立**。本增量「最大回归面」（7 处守卫接入）与「最易踩的坑」（K38 定义顺序）经对抗性攻击**均未击穿**。

---

## 12. 交付物清单

| # | 交付物 | 类型 | 说明 |
| --- | --- | --- | --- |
| 1 | `docs/mobile-app/QA-mobile-increment-5.md` | **新增** | 本报告 |
| 2 | `apps/mobile/tests/increment5-qa.test.ts` | **新增** | QA 独立验证套件（**51 用例**，独立新文件，**未改**工程师的 `increment5-closure.test.ts`） |
| 3 | `apps/mobile/tests/increment3-qa.test.ts` | **修改（任务 B，授权窄边界）** | 仅 1 处用例新增 2 行 `dueAt` 锚定（+10 行含注释），使 `naive > union` 时刻鲁棒；断言文本 / 语义 / 标题均未改 |

**铁律遵守声明**：

- ✅ **未修改 `src/` 下任何文件**（`find src -newermt 23:10` **零命中**；5 个源码 mtime 停留工程师施工窗口 `22:54`~`23:03`）。
- ✅ **未修改任何既有测试断言**，**唯一例外** = 任务 B 授权的 `tests/increment3-qa.test.ts`（窄边界：仅锚定 `dueAt`）。增量 5 那 3 处授权改动**由工程师完成**，QA **未再动**。
- ✅ 新用例写在**独立新文件** `tests/increment5-qa.test.ts`。
- ✅ **零新增依赖**（`package.json` mtime 未变）；无 `reanimated` / `gesture-handler`；全程使用 `npx`（未用 `pnpm`）。
