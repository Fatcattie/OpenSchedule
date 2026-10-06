# 交付说明（增量 5）— OpenSchedule 移动端：提报 / 审核闭环补完

> 交付人：齐活林（Qi）· 交付总监 · 日期：2026-09-27 · 交付路径：`apps/mobile`
> 基线：`PRD-mobile-increment-5.md` **v1.0** · `ARCH-mobile-increment-5.md` **v1.0** · `QA-mobile-increment-5.md`（第 1 轮）
> 上游：`DELIVERY-mobile-increment-4.md` §7（已知限制 1 / 2 / 3 条 = 本次前三件事）

---

## 一、TL;DR

补齐「提报 / 审核」闭环最后三处缺口：**①撤回完成提报后审核人收不到任何反馈**（新增 `withdrawCompletionAndNotify` 包装入口，向**撤回前**全部审核人各派发 1 条「撤回提醒」）；**②`submissionStatus` 的写入长期无守卫**（新增唯一守卫 `assertSubmissionTransition` 并接入 **7 处**赋值点）；**③通知类型三处映射缺 `review.withdrawn`**（补齐 label / icon / 注释）。

- 交付状态：**✅ 可验收**（QA 判定 `NoOne`，**第 1 轮即收敛，未使用第 2 轮配额**）
- 测试：`tsc` exit **0**；**35 套件 / 668 用例全绿**（基线 33 / 586）
- 浏览器 E2E：撤回通知链路 + **对照组**（非提报人看不到入口）全部 PASS，控制台 **0 error**（仅 1 条已知 `useNativeDriver` 警告）
- 已知问题：P0 × 0、P1 × 0、P2 × 0；P3 × 6（登记不修）
- 新增依赖：**0**

---

## 二、交付物清单

### 2.1 源码：5 改 / 0 新增文件

| # | 文件 | 改动 | 行为变更 |
| --- | --- | --- | --- |
| 1 | `src/utils/submission.ts` | `SUBMISSION_TRANSITIONS` 修正为**实读反推的真实可写入集合**（`approved: ['pending']`、`rejected: ['draft','pending']`、`withdrawn: ['draft','pending']`） | **否**（原为**死表**，运行时零调用者） |
| 2 | `src/services/task.service.ts` | ① 新增本地 `assertSubmissionTransition`（紧随 `assertTransition`）；② 接入 **7 处** `submissionStatus` 赋值点；③ `withdrawSubmission` 增加 `isSubmissionRecord` 守卫（**纯加固**）；④ **新增** `withdrawCompletionAndNotify`（**置于 `reviewSubmission` 之后**，K38） | **是**（新增包装入口 + 1 处用户不可达加固） |
| 3 | `src/screens/TaskDetailScreen.tsx` | `:296` 调用点 `withdrawCompletion` → `withdrawCompletionAndNotify`（**仅换函数名，入参不变**） | 是（撤回后新增通知副作用） |
| 4 | `src/types/domain.ts` | ① `NOTIFICATION_EVENT_LABEL` 追加 `'review.withdrawn': '撤回提醒'`；② `:98` 注释补成**完整 8 项清单**（**单行**，保留既有子串） | **否**（声明式 + 注释） |
| 5 | `src/screens/NotificationsScreen.tsx` | `NOTIFICATION_ICON` 追加 `'review.withdrawn': 'corner-up-left'` | **否**（声明式） |

> **`withdrawCompletion` 函数体零改动**（K24 / K27 边界：该函数体继续「零通知」，由 2 处源码切片断言锁定）。

### 2.2 测试

| # | 文件 | 归属 | 用例数 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | `tests/increment5-closure.test.ts` | 工程师（**新增**） | **31** | AC 代表性子集 + K38 位置断言 + AC-14 源码计数 |
| 2 | `tests/increment5-qa.test.ts` | QA 第 1 轮（**新增**） | **51** | 独立验证（攻击式） |
| 3 | `tests/submission-flow.test.ts` | **授权改动 1 条 expect** | — | `:76` `.toBe(false)` → `.toBe(true)` |
| 4 | `tests/increment4-qa.test.ts` | **授权改动 2 条 expect** | — | `:515-517` 整表 3 值 + `:520` `.toBe(false)` → `.toBe(true)` |
| 5 | `tests/increment3-qa.test.ts` | QA 自修（授权窄边界） | — | 时刻鲁棒修复（见 §6.4） |

> **既有 33 个套件的断言除上述授权点外 100% 未被修改**；`it` 标题**一字未改**（未授权）。

### 2.3 文档

| 文件 | 版本 | 说明 |
| --- | --- | --- |
| `PRD-mobile-increment-5.md` | **v1.0** | 需求 17 条（P0×7 / P1×2 / P2×8）；AC × 17；INV × 12；裁定 R6-1~R6-10；待确认 Q × 18（含裁定）；限制 14 条 |
| `ARCH-mobile-increment-5.md` | **v1.0** | T01~T05；**K27~K38**；§8 回归矩阵 **33 行**；§9 授权改动清单；§13 修订记录 |
| 附件 | — | `sequence-diagram-increment-5.mermaid`、`class-diagram-increment-5.mermaid` |
| `QA-mobile-increment-5.md` | 第 1 轮 | AC 17/17、INV 12/12、判定 **`NoOne`** |

---

## 三、范围裁定：4 件事，3 处新增行为 + 1 处纯注释

| # | 事项 | 落地 | 性质 |
| --- | --- | --- | --- |
| **B1** | 撤回完成提报后通知审核人 | 新增 `withdrawCompletionAndNotify` + 屏幕改调 | **新增包装入口**；`withdrawCompletion` 函数体零改动 |
| **B2** | `withdrawSubmission` 增加主体守卫 | 新增 `isSubmissionRecord` 前置检查（40302） | **纯加固**（唯一调用点数据源已过滤 ⇒ 用户不可达） |
| **B3** | 提报状态机收口 | 表修正 + 唯一守卫 + **7 处**接入 | 表修正对运行时零影响（死表）；守卫接入对既有 7 条链路**逐条放行、零回归** |
| **B4** | 通知类型注释补全 | `domain.ts:98` 补成 8 项清单 | **纯注释** |

---

## 四、核心设计（B1 撤回通知链路）

### 4.1 分层与唯一入口（K33）

```
withdrawCompletion            纯状态迁移、零通知（K24/K27 边界，函数体零改动）
        ↑ 被组合
withdrawCompletionAndNotify   迁移 + 通知副作用 —— 唯一派发点
        ↑ 被调用
TaskDetailScreen.tsx:296      唯一产品入口（禁止屏幕直调 withdrawCompletion）
```

### 4.2 实现姿势 = 「先快照 → 后迁移 → 成功后派发」（K34）

```ts
// ① 快照：必须在 withdrawCompletion 的清理之前（K28 / K34）
const reviewerIds = [...(task.reviewerIds ?? [])]

// ② 先迁移（失败即抛出 ⇒ 零通知、零副作用）
const updated = await withdrawCompletion(taskId, input)

// ③ 后派发：撤回前全部审核人各 1 条（未读级去重，K29）
for (const reviewerId of reviewerIds) {
  pushNotificationOnce({
    userId: reviewerId,
    type: 'review.withdrawn',
    title: '提报已撤回',
    body: `「${updated.title}」的完成提报已被提报人撤回，无需审核`,
    data: { taskId },
  })
}
```

### 4.3 🔴 K38 —— 包装函数的**定义位置**是硬约束（本 ARCH 新发现）

全仓有 **2 处源码切片断言**：

```
slice(indexOf('export async function withdrawCompletion'),
      indexOf('export async function reviewSubmission'))
```

取「`withdrawCompletion` 函数体」并断言 **`not.toContain('pushNotification')`**。

包装函数体含 `pushNotificationOnce`（**含子串** `pushNotification`）⇒ 若插在 `withdrawCompletion` 与 `reviewSubmission` **之间**，会**同时打破 2 个套件**。

**⇒ 铁律 K38：包装函数必须定义在 `reviewSubmission` 之后。**

**实测位置链**：`withdrawCompletion` `:1018` < `reviewSubmission` `:1076` < `withdrawCompletionAndNotify` `:1169` ✅

> 此坑**主理人与 PM 均未识别**，由架构师在实读测试源码时发现 —— 这正是「专业产出必须由对应成员输出后再采信」的价值所在。

### 4.4 双重时序陷阱（K28）

`applyClearedReviewState(task)` 会把 `reviewerIds` 置 `[]`、`submissionStatus` 置 `null`。因此：

| 快照 | 落点 | 若放错位置 |
| --- | --- | --- |
| `reviewerIds` | 包装函数内，调 `withdrawCompletion` **之前** | 接收人退化为空 ⇒ 零通知 |
| `submissionStatus` 的 `from` | `withdrawCompletion` 内，`applyClearedReviewState` **之前** | 读到 `null` ⇒ 误判「初始写入」而放行，或误抛 40302 |

> 注：K22（校验一律在写入之前）要求守卫置于清理**之前** ⇒ 守卫与赋值之间存在 `applyClearedReviewState` 一行，AC-14 的「紧邻前文」判定须用**窗口判定**。

---

## 五、验证结果

### 5.1 静态与单测（主理人独立复跑，非采信成员陈述）

```
npx tsc --noEmit                     → TSC_EXIT=0
npx jest --config jest.config.js     → Test Suites: 35 passed, 35 total
                                       Tests:       668 passed, 668 total
```

套件 / 用例演进：`31/502`（增量 3）→ `33/586`（增量 4）→ **`35/668`（增量 5）**

### 5.2 浏览器端到端验收（`dist-v8` @ `http://127.0.0.1:4177`）

> ⚠️ **方法学教训**：验收中途若使用**整页跳转**（`goto`），会**重新加载应用并重置内存 mock 库**，导致此前所有写入（含通知）**被清空**。本次首轮曾因此误判「通知未创建」。**本增量全程仅用应用内导航**（点击 / 返回 / Tab）。

| # | 断言 | 结果 |
| --- | --- | --- |
| E2E-01 | 完成任务（张伟为负责人）⇒ 详情页出现「待审核」标签 + 「撤回提报」入口 | ✅ |
| E2E-02 | 审核人（`allManagerIds` 含张伟）收到「待你审核」通知，图标 = `inbox`（**U+F186**） | ✅ |
| E2E-03 | 「撤回提报」二次确认文案：`撤回后该完成提报将退出审核列表，任务回到「进行中」继续推进，确定撤回吗？` | ✅ |
| E2E-04 | 撤回成功 ⇒ 任务回到**进行中**、「待审核」标签消失、「撤回提报」入口消失 | ✅ |
| E2E-05 | **审核人收到「提报已撤回」通知**，图标 = `corner-up-left`（**U+F14E**） | ✅ |
| E2E-06 | 撤回后立即完成另一任务 ⇒ 新「待你审核」通知正常（两条互不干扰） | ✅ |
| E2E-07 | **对照组**：审核人打开**他人**的待审任务（task-014，负责人李娜）⇒ 「撤回提报」入口**隐藏**（`hasWithdraw=false`） | ✅ |
| E2E-08 | 控制台 **0 error**（仅 1 条已知 `useNativeDriver` 警告） | ✅ |

**图标码点反向验证**（读 `glyphmaps/Feather.json`，按 `codePointAt(0)` 反查）：

| 码点 | 实际图标 | 用于 |
| --- | --- | --- |
| `U+F14E` | `corner-up-left` | **本次新增** `review.withdrawn` |
| `U+F186` | `inbox` | 增量 3 `review.pending` |
| `U+F139` | `clock` | `deadline_approaching` |
| `U+F206` | `user-check` | `task.assigned` |
| `U+F150` | `cpu` | `ai.proposal` |
| `U+F118` | `at-sign` | `mention` |
| `U+F12C` | `check-circle` | `task.completed` |

**截图存证**：`screenshots/mobile/inc5-01-notify-withdrawn.png`、`inc5-02-control-non-submitter.png`、`inc5-03-withdraw-entry.png`、`inc5-04-withdraw-confirm.png`

### 5.3 QA 智能路由

🟢 **`NoOne`** —— 源码**零缺陷**；AC **17/17**、INV **12/12**；唯一红过的用例 = **QA 自己在增量 3 写的时刻相关断言**（测试代码自身 Bug），已按授权**在本轮自修**并闭环。**第 1 轮即收敛，未进入第 2 轮。**

QA 的重点攻击点与结论：

- **K38 定义顺序**：✅ 成立（位置链实测 + 2 处切片断言仍绿 + QA 独立复刻判定式）
- **撤回失败零通知 / 接收人 = 撤回前快照 / 去重**：✅ 成立
- **7 处守卫接入点逐条回归**（最大回归面）：✅ 全部零回归
- **幂等豁免 / `from == null` 仅放行 `pending`**：✅ 成立
- **反向证明**：`approved → rejected` 非法变化 ⇒ `40302`（守卫**真拦截**，不是空跑）

### 5.4 授权改动边界复核（K37）

| 项 | 结论 |
| --- | --- |
| 授权 expect 总数 | **3 条**（`submission-flow.test.ts:76` 1 条 + `increment4-qa.test.ts` 2 条） |
| 是否越界 | ❌ 未越界：全仓 `canTransition('approved','pending')` 恰 **3 处**，终值全为 `true`，**无 `false` 残留** |
| `it` 标题 | **一字未改**（未授权） |

---

## 六、过程发现与纠偏

### 6.1 主理人 4 项前提被 PM 纠正（全部采纳）

| # | 我的原前提 | PM 实读结论 |
| --- | --- | --- |
| C1 | 「撤回通知」= 新增一条通知即可 | ❌ 「零通知」被 **4 条断言 + K24** 锁定，且 `pushNotificationOnce` **含子串** `pushNotification` ⇒ **改名无法规避**，**必须**用包装函数 |
| C2 | 授权面 = 1 处 expect | ❌ 不足：`increment4-qa.test.ts:511-521` **整表 `toEqual` 亦锁定该表** |
| C3 | `approved → pending` 写入点在 `TodayFocusScreen.tsx:257` | ❌ 实际在 **`:264`** |
| C4 | K15 严重度一般 | ❌ 低估：`:179` 的**唯一目的**就是排除「审核轮回态」 |

### 6.2 架构师新发现 K38（主理人 / PM 均未指出）

见 §4.3。这是本增量**风险最高、最不直观**的一条约束。

### 6.3 工程师发现既有测试的时刻相关缺陷

`tests/increment3-qa.test.ts:103` 的 `expect(naive).toBeGreaterThan(union.length)` 在**深夜**必然失败（`listDeadlineApproaching` 的 24h 滑动窗口使种子 `task-014` / `task-015` 漂出）。

- **主理人独立复现**（23:10 实测：`naive = 10`，期望 `> 10`）⇒ 确认为**既有缺陷**，非本次引入
- **路由判定**：该文件为 **QA 自己编写**，且属**同类缺陷**（QA 已修过一次）⇒ 派 **QA** 修复
- **修复方式**：在用例开头锚定 `dueAt`（`findTask('task-014'/'task-015')!.dueAt = demoDayAt(0, 23, 59)`）+ 补 8 行注释；**断言文本一字未改，语义等价**
- **验证**：QA 模拟 6 个时刻复跑，不再漂移

### 6.4 主理人自我纠偏（方法学）

首轮浏览器验收时，我在流程中途使用了**整页跳转**，导致应用重载、内存库重置，从而**误判「撤回后审核人未收到通知」**。经重跑（全程应用内导航）确认通知**正常创建**。已将该坑写入 `expo-web-e2e-verify` skill。

---

## 七、已知限制（本次不做，已登记）

| # | 限制 | 说明 |
| --- | --- | --- |
| P3-1 | 撤回 → 重提 → 再撤回，第二条「撤回提醒」被去重吞掉 | `pushNotificationOnce` 三元组 (`userId`,`type`,`taskId`) 中首条**仍未读**时命中 ⇒ 跳过写入。**符合 K29 设计**（未读级去重），非缺陷 |
| P3-2 | 撤回后，此前已发出的「待你审核」通知**不会被召回** | 站内通知为追加式流水，无撤回机制 |
| P3-3 | 通知偏好开关未种子化 | 无 `review.withdrawn` 偏好项，一律发送 |
| P3-4 | K15「审核轮回态」可见性口径**维持现状** | 属既有行为，本次刻意不动（回归红线） |
| P3-5 | PRD / ARCH 的行号在 +45 行插入后产生漂移 | 文档内已标注「基线行号 vs 实际行号」 |
| P3-6 | 2 处 `it` 标题语义已陈旧 | 未获授权，**不改** |

---

## 八、勘误（沿用增量 3 / 4 的自我纠错机制）

### 8.1 增量 3 交付文档 §7-4 的失真陈述（已在增量 3 文档内勘误）

我曾声称「`task.completed` / `review.result` 的 label / icon 映射缺失、会静默降级」，并归因到上游 PRD / ARCH。**实读验证：两处映射表均含全部 7 个类型，上游文档从未如此陈述** —— 该失真**由我引入**。已在 `DELIVERY-mobile-increment-3.md` §7-4 与 `DELIVERY-mobile-increment-4.md` §8-5 补勘误。

### 8.2 本增量对「三处同步点」的准确表述

`NotificationItem.type` 是 **`string`**（**不是联合类型**）⇒ 缺失映射会**降级**（图标回退 `bell`、标签回退英文 key），**不会**产生类型错误。本增量的 `review.withdrawn` **三处全部补齐**，无降级。

---

## 九、给用户的下一步建议

1. **浏览器验收**（最新版 = 增量 5）：打开 **`http://127.0.0.1:4177/`**（`dist-v8`），登录 `zhangwei@example.com / openschedule`。
   - 建议路径：工作台 → 我的待办 → 「接口联调环境」（进行中）→ **标记完成** → 填实际工时 → 确认 → 左上角返回 → 右上角**铃铛** → 顶部应见「待你审核」→ 点它回到任务 → **撤回提报** → 确定撤回 → 返回 → 铃铛 → 应见 **「提报已撤回」**。
   - ⚠️ 请勿在流程中使用浏览器**地址栏跳转 / F5**：会重置演示数据。
2. **历史版本对照**（已保留，仅供比对，非最新）：`4176`（增量 4）、`4175`（增量 3）、`4174`（增量 2）、`4173`（增量 1）。
3. **清理建议**：`apps/mobile/dist-v4` ~ `dist-v8` 确认不再需要后可手动删除（沙箱禁止批量删除）。
4. **后续增量候选**（均来自 §7 已登记限制，需你选定范围）：
   - 撤回后**召回**已发出的「待你审核」通知（P3-2）；
   - 通知偏好开关落地（P3-3）；
   - 「撤回 → 重提」链路的去重策略细化（P3-1）。
5. **回归基线**：任何后续增量开工前，请以 **`tsc` exit 0 + 35 套件 / 668 用例全绿** 为红线；既有断言除明确授权外**一字不改**。

---

## 十、结论

| 维度 | 结果 |
| --- | --- |
| 交付状态 | **✅ 可验收** |
| 测试通过率 | **668 / 668 = 100%**（35 / 35 套件） |
| AC / INV | **17 / 17** · **12 / 12** |
| QA 判定 | **`NoOne`**（第 1 轮收敛） |
| 已知问题 | P0 × 0 · P1 × 0 · P2 × 0 · P3 × 6（登记） |
| 新增依赖 | **0** |
| 浏览器 E2E | **8 / 8 PASS**，控制台 0 error |
