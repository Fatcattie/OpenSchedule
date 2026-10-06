# 交付说明（增量 3）— OpenSchedule 移动端：双计去重 + 「待你审核」站内通知

> 交付人：齐活林（Qi）· 交付总监 · 日期：2026-09-27 · 交付路径：`apps/mobile`
> 基线：`PRD-mobile-increment-3.md` **v1.2** · `ARCH-mobile-increment-3.md` **v1.1** · `QA-mobile-increment-3.md`（第 1~2 轮）
> 上游：`PRD-mobile-increment-2.md` v1.2 §8-2（双计已知限制）· §4 `M3-P2-01`（「待你审核」通知）

---

## 一、TL;DR

**把「今日聚焦」头部「共 N 项待处理」从「三组长度相加」（虚高）改为「三组按 `task.id` 取并集」（真实待办数），并让「完成提报」的任务离开「今日到期」；同时新增 `completeTask` → 「待你审核」站内通知，带未读级去重（完成 → 重开 → 再完成不刷屏）。**

- 交付状态：**✅ 可验收**（QA 最终判定 `NoOne`）
- 测试：`tsc` exit **0**；**31 套件 / 502 用例全绿**（基线 28 / 445）
- 浏览器 E2E：**9 项关键断言全部 PASS**，控制台 **0 error**
- 已知问题：P0 × 0、P1 × 0；P2 × 2（均为测试代码时刻鲁棒性，**第 2 轮已由 QA 自修**）；P3 × 3（登记不修）
- 新增依赖：**0**

---

## 二、范围（用户拍板）

| # | 内容 | 说明 |
| --- | --- | --- |
| ① | **双计去重** | 修掉「今日到期 / 待我审核」的重复计数（实为**三计**，见 §4.2）；并让「已完成待审」离开「今日到期」 |
| ② | **「待你审核」站内通知** | 原 `M3-P2-01`：任务被完成提报后，向审核人推送站内通知 |

### 显式「不做」（范围铁律，禁止顺手做）

| 编号 | 内容 | 依据 |
| --- | --- | --- |
| **N1** | 「完成提报」撤回入口 | Q3-11 |
| **N2** | 非 `done` 的既存 `pending` 缺口收口（种子 `task-014` / `task-015` 经 `moveTask` 仍留待审队列） | §1.4 |
| **N3** | 详情页状态标签统一 / 任何重构 | §1.4 |
| **Q4-12** | 「今日到期」与「临期预警」**列表内容**互斥（本次只修**头部汇总**口径，列表内容不变） | PRD §7 裁定 |
| **Q4-13** | 纠正种子 `notif-002` / 补通知偏好种子 | PRD §7 裁定 |
| **Q4-14** | 「今日到期」加 `assigneeId` 过滤（现状为**全租户**口径） | PRD §7 裁定 |

---

## 三、交付物清单

### 3.1 源码：5 改 + 1 新增

| # | 文件 | 改动 | 字节 |
| --- | --- | --- | --- |
| 1 | `src/utils/focus.ts` | **新增** —— `countVisibleFocusTasks(groups, { includeReview })`：三分组按 `task.id` 取并集的**唯一纯函数** | 1,855 |
| 2 | `src/services/task.service.ts` | `listTodayDue` 补两条排除（`status !== 'done'` + `submissionStatus !== 'pending'`）；`completeTask` 末尾向 `task.reviewerIds` 派发 `review.pending` | 37,765 |
| 3 | `src/data/index.ts` | **新增** `pushNotificationOnce(input)` —— 未读级去重写入器 | 7,986 |
| 4 | `src/types/domain.ts` | `NOTIFICATION_EVENT_LABEL` += `'review.pending': '待审核提醒'`；注释登记表 += `review.pending` | 4,650 |
| 5 | `src/screens/NotificationsScreen.tsx` | `NOTIFICATION_ICON` += `'review.pending': 'inbox'` | 6,966 |
| 6 | `src/screens/TodayFocusScreen.tsx` | 头部 `visibleTotal` 由「三组相加」改为 `countVisibleFocusTasks(...)` 并集口径；审核组注入 `footer` | 24,021 |

### 3.2 测试：3 个新增文件

| # | 文件 | 归属 | 用例数 |
| --- | --- | --- | --- |
| 1 | `tests/increment3-dedup-notify.test.ts` | 工程师（第 2 轮由 QA 修正 2 处时刻断言） | — |
| 2 | `tests/increment3-qa.test.ts` | QA 第 1 轮独立验证 | 22 |
| 3 | `tests/increment3-notify-screen.test.tsx` | QA 第 1 轮组件级 | 4 |

> **既有 28 个套件的断言 100% 未被修改**（mtime 双重确认：既有套件最新 mtime = `17:03:30`，增量 3 施工窗口 = `18:26`~`18:33`）。

### 3.3 文档

| 文件 | 版本 | 说明 |
| --- | --- | --- |
| `PRD-mobile-increment-3.md` | **v1.2** | 8 需求（P0×5 / P1×1 / P2×2）、12 AC、5 INV；v1.1 修正 `task-001` 事实性错误；v1.2 补 AC-02 时刻限定语 + §8 登记 |
| `ARCH-mobile-increment-3.md` | **v1.1** | T01–T08、K13–K18、D1–D8、18/18 回归行；v1.1 全文更正 `task-001`→`task-004` + K11 落点规则由 `M4-P1-01` 取代 |
| `QA-mobile-increment-3.md` | 第 1~2 轮 | 第 1 轮：AC 12/12、INV 5/5、判定 🟡 QA；第 2 轮：QA 自修 2 处时刻断言，判定 **`NoOne`** |
| `PRD-mobile-increment-2.md` | **v1.2** | §8-2 勘误（「双计」→「重复计数（双计/三计）」）+ 行号更正 `:167-183` / `:140` + 头部版本同步 |
| `ARCH-mobile-increment-2.md` | **v1.5** | §8.1-#8 补注 + §9.2-P6 归属更正 |

---

## 四、核心设计

### 4.1 双轨口径修正（两层）

```
列表层：listTodayDue  ——  补两条排除
  task.status !== 'cancelled'
  task.status !== 'done'                    ← 新增（已完成不应显示为「今日到期」）
  task.submissionStatus !== 'pending'       ← 新增（待审中不属于「今日到期」）
  !isSubmissionRecord(task)

汇总层：visibleTotal   ——  由「三组相加」改为「三组并集」
  countVisibleFocusTasks(groups, { includeReview: canReview })
  includeReview === false（member）⇒ pendingReview 组【整组不进并集】（不是「并集后再减 1」）
```

> ⚠️ **关键**：**单靠「排除 `done`」修不掉本次的双计** —— 种子 `task-014` / `task-015` 是 `in_progress` + `submissionStatus='pending'`，必须由「排除待审中」覆盖。判定「待审中」**只能用 `submissionStatus === 'pending'`，禁用 `status`**。

### 4.2 「双计」实为「三计」

种子 `task-014` / `task-015`（`dueAt` = 当日 17:00 / 19:00，多数时段落在 24h 滑窗内）会**同时出现在三个分组**：

| 分组 | `task-014` / `task-015` 是否在 |
| --- | --- |
| 今日到期 | ✅（修正前） |
| 临期预警 | ✅ |
| 待我审核 | ✅ |

⇒ 修正前朴素相加 = **17**（PRD 推导），实际唯一任务数 = **10**。
⇒ 只有「**按 `task.id` 取并集**」能一次覆盖三组间**全部**重叠；只在 `listTodayDue` 加排除条件**不足以**消除与「临期预警」的重叠。

### 4.3 「待你审核」通知 + 未读级去重

```
completeTask(taskId)
  ├─ status='done', completedAt=now(), submissionStatus='pending',
  │  reviewRequired=true, reviewerIds=allManagerIds(), 审核态复位
  ├─ pushAudit('task.complete', ...)
  └─ for (uid of task.reviewerIds)            ← 用 task.reviewerIds，不二次调 allManagerIds()
        pushNotificationOnce({ userId: uid, type: 'review.pending',
                               title: '待你审核',
                               body: `「${task.title}」已完成提报，等待你的审核`,
                               data: { taskId } })

pushNotificationOnce(input)
  ├─ 去重键 = userId + type + data.taskId
  ├─ 「未读」判据 = readAt === null            ← 不是 status === 'sent'
  ├─ 命中 ⇒ 返回 null，【不消耗】nextId 序号，不新增记录
  └─ 未命中 ⇒ 走 pushNotification 原路径
```

**接收人同源**：通知接收人来自 `task.reviewerIds`，与 `listPendingReview` 的可见性判定**同源**（K18）。

---

## 五、验证结果

### 5.1 静态与单测（主理人独立复跑，非采信成员陈述）

| 项 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **exit 0** |
| `npx jest --config jest.config.js` | **31 套件 / 502 用例全绿**（`Time: 44.325 s`） |
| 基线对比 | 增量 2 交付态 28 / 445 → 本增量 **+3 套件 / +57 用例** |
| 禁用依赖 | `grep -rn "reanimated\|gesture-handler" src` → **无命中** |
| 新增依赖 | **0** |

### 5.2 浏览器端到端验收（`dist-v6` @ `http://127.0.0.1:4175`）

> 运行时刻：**2026-09-27 20:20~20:38（Asia/Shanghai）**，登录角色 **张伟（管理人员 / manager）**。
> ⚠️ 本增量有**时刻相关值**：当日 20:38 时 `task-014`（`dueAt` 19:00）已漂出 24h 滑窗 ⇒ 「临期预警」= **5**（当日 12:00 之后为 6）。并集恒为 10。

| AC | 断言 | 实测 | 结论 |
| --- | --- | --- | --- |
| **AC-01** | `listTodayDue` = 5 条，不含 `done` / `pending` | 「今日到期」徽标 = **5**；列表 = 组件库搭建 / 首页原型设计 / 本周复盘会材料 / 需求文档评审 / 官网改版验收清单 | ✅ |
| **AC-02** | 头部 N = 三组并集 | 头部「共 **10** 项待处理」；徽标 5 / 4 / 5。**主理人独立复算**：三组实际条目交集 = 今日到期∩临期预警 {组件库搭建, 首页原型设计, 官网改版验收清单} = 3、待我审核∩临期预警 {完成提报：首页原型评审} = 1 ⇒ 5+4+5−3−1 = **10**，与头部**完全吻合** | ✅ |
| **AC-03** | `listTodayDue ∩ listPendingReview = ∅` | 「今日到期」列表**无任何**「完成提报：…」条目（`task-014` / `task-015` 已离开） | ✅ |
| **AC-05** | `completeTask` 派发「待你审核」 | 完成「组件库搭建」后，通知列表**首条** = **待你审核** / 「组件库搭建」已完成提报，等待你的审核 / 刚刚 · 点击查看任务 | ✅ |
| **AC-06** | 完成 → 重开 → 再完成 ⇒ 不新增、原记录不变 | 二次完成「首页原型设计」后：未读数**仍为 5**、待你审核行**仍为 2 条**，且该行时间戳**仍为「2 分钟前」**（原记录被复用，未消耗新 `nextId`） | ✅ |
| **AC-08②** | 新类型图标映射 = `inbox`（非 `bell` 兜底） | 用 Feather 字形表反查：待你审核行字形 = `U+F186` = **`inbox`**（`bell` = `U+F11E`，未出现）；7 条通知字形序列与列表**逐条一一对应** | ✅ |
| **AC-09** | 点击 → 标记已读 + 深链 | 点击「待你审核」通知 ⇒ 跳转 `/task/task-005`；返回后未读 **5 → 4** | ✅ |
| **AC-12** | 未读数 4 → 5 | 完成前 **4 条未读**，完成后 **5 条未读** | ✅ |
| **INV-4** | 离开 `done` ⇒ 审核态清理 | 详情页「重开为进行中」后状态变**待办**且「待审核」标签**消失** | ✅ |
| **K15** | `listDeadlineApproaching` **有意不**排除 `pending` | 「临期预警」列表中**仍含**「完成提报：首页原型评审」（`task-014`，`pending`） | ✅ |

**控制台**：本次会话日志仅 2 条（1 条既有 `useNativeDriver` WARNING + 1 条 DOM VERBOSE），**0 error**。

**关键实证（AC-06 去重）**：二次完成后通知行的时间戳**未被刷新**（仍「2 分钟前」），这是「命中去重路径、复用原记录」的**直接证据**，而非仅仅「数量没变」。

### 5.3 QA 智能路由（两轮）

| 轮次 | 判定 | 说明 |
| --- | --- | --- |
| 第 1 轮 | 🟡 **QA** | 源码**零缺陷**；唯一缺陷在**测试代码**（`increment3-dedup-notify.test.ts` 2 处**时刻相关断言**，上午 12:00 前 / 20:00 后必红） |
| 第 2 轮 | ✅ **NoOne** | QA 自修 2 处断言为**时刻鲁棒**写法（语义不变），并在模拟 **08:00 / 20:30** 两时刻下实证不再漂移；`tsc` 0 error、31/502 全绿 |

---

## 六、施工期发现的文档错误（已闭环）

| # | 错误 | 发现者 | 处置 |
| --- | --- | --- | --- |
| 1 | **AC-04 / T07 用例用 `completeTask('task-001')`** —— 但 `TASK_TRANSITIONS.todo` 不含 `'done'`（`types/task.ts:107`），`completeTask` 有 `assertTransition` 守卫 ⇒ 对 `todo` 的 `task-001` **第一步即抛 40902**；且种子 `task-001` 确为 `todo` | 工程师 | 测试改用 `task-004`（`in_progress` + 今日到期），AC 语义完整保留；ARCH-3 出 **v1.1** 全文更正，PRD-3 出 **v1.1** 更正 |
| 2 | **K11 落点规则与 `M4-P1-01` 冲突** —— K11（源自 ARCH-2）要求新用例写进 `tests/increment2-completion.test.ts`，而本增量明确要求写**独立新文件** | 架构师 | ARCH-3 v1.1 裁定：K11 的**落点**规则由 `M4-P1-01` 取代；K11 的**实质精神**（禁止改动既有套件断言）继续有效 |
| 3 | **PRD-3 AC-02 未限定「时刻相关」** —— 读者看表格会误以为 N 恒为 10 | QA（第 1 轮 §10 问题 3） | PRD-3 **v1.2** 补限定语：10 为「当日 12:00 之后」的取值，08:00 时为 9 |
| 4 | **PRD-3 AC-01 未说明是否时刻相关** | QA | PM 实读 `listTodayDue` 确认为**日历日**比较（`toDateKey` 相等），与 24h 滑窗无关 ⇒ 5 恒定；v1.2 显式写明 |
| 5 | **PRD-2 §8-2 三处遗留** —— 头部版本漂移、行号漂移（`:160-168`→`:167-183`、`:138`→`:140`）、标题「双计」与正文「三计」不一致 | 主理人 | PRD-2 **v1.2** 一并修正 |

---

## 七、已知限制（本次不处理，已登记）

| # | 限制 | 登记处 |
| --- | --- | --- |
| 1 | 「今日到期」与「临期预警」**列表内容仍重叠**（定义上是包含关系，实测重叠 3~5 条）；本次只修**头部汇总**口径，列表内容不变。修复后朴素相加仍 > 并集 ⇒ 该重叠**只体现在徽标之和**上，不影响头部 N | PRD §8 / ARCH §9-3 |
| 2 | **非 `done` 的既存 `pending` 缺口**：种子 `task-014` / `task-015` 经 `moveTask` 移出 `done` 后仍留待审队列（N2） | PRD §1.4 |
| 3 | 「完成提报」**撤回入口**缺失（Q3-11 / N1） | PRD §7 |
| 4 | ~~**`task.completed` 的 label / icon 映射缺失**（既存问题）~~ **【勘误 · 2026-09-27 增量 4 施工期复核后更正：该表述不成立】** 实读 `src/types/domain.ts:125-132` 与 `src/screens/NotificationsScreen.tsx:24-31` 确认：**两个映射表均已包含全部 7 个类型**（含 `task.completed` / `review.result`）⇒ **不存在「映射缺失导致的静默降级」**。真正的缺口只是 `domain.ts:98` 的**类型注释**陈旧（注释列 5 个、实有 7 个），即下一条。<br>**勘误说明**：原表述把上游文档的「**注释登记表不完整**」错误升格为「**映射缺失会静默降级**」，且所引出处 `PRD §8` / `ARCH §9-6` **均无此说法** —— 上游实为正确表述（`ARCH-3 §3.4.1` 明确列出 6 个键含 `task.completed`；`§3.4.2` 说的是注释只列 4 个）。此为**本交付文档（主理人撰写）自身的转述失真**，非上游错误 | 勘误（原引出处不成立） |
| 5 | `src/types/domain.ts:98` 类型注释登记表**仍不完整**（缺 `task.completed` / `review.result`）；建议后续增量改为**唯一类型登记表 + CI 校验** | PRD §8-14 |
| 6 | `tests/today-focus-gate.test.tsx:205` 注释文案「排除 review（due+approaching=0）」在**并集口径**下措辞略旧（断言值正确且属 AC-10 受保护断言，**一字不改**） | PRD §8-13 |
| 7 | **手势盲区**：右滑卡片（`SwipeableRow`）在桌面浏览器不可靠复现，需真机手测。⚠️ 注意**假阳性** —— 动作按钮始终存在于 DOM（只是被卡片盖住），`querySelectorAll` 命中「完成」**不代表**滑动已展开，**必须看截图** | 本文件 §8 |
| 8 | **跨自然日边界**：种子 `mockTasks` 于**模块加载时**按当日锚定，若进程跨自然日持续运行，AC-01 的「5」理论上会漂移（属**跨日**边界，非「时刻（时分）相关」） | PRD §9 |

---

## 八、给用户的下一步建议

1. **浏览器验收**：`http://127.0.0.1:4175/`（**增量 3 最新产物 `dist-v6`**）—— 演示账号 `zhangwei@example.com / openschedule`，登录后进「今日」Tab 看头部「共 10 项待处理」；点右上角铃铛看「待你审核」。
2. **对比旧版**：`4174` = 增量 2 产物（`dist-v5`）、`4173` = 增量 1 产物（`dist-v4`）—— 三个端口**并行存活**，可直接对照。
3. **真机手测**：右滑卡片完成 / 通过 / 驳回的手势，请在真机或模拟器复验（桌面浏览器为已知盲区）。
4. **目录清理**：`apps/mobile/dist-v4` / `dist-v5` 在不需要对比后可手动删除（受沙箱批量删除守卫限制，我未自动清理）。
5. **后续增量候选**：§7 已知限制的 1 / 2 / 3 项（列表内容互斥、非 `done` 的 `pending` 收口、撤回入口）—— 三者同属「提报/审核状态机」的收口，建议合并为一个增量处理。
