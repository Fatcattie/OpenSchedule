# OpenSchedule 移动端 · 增量 3 交付概览

> 日期：2026-09-27 · 交付人：齐活林（交付总监）· 路径：`apps/mobile`
> 一句话：**修掉「今日聚焦」头部的重复计数，并让「完成提报」触发「待你审核」站内通知（带未读级去重）。**

---

## 做了什么

| # | 需求 | 实现 |
| --- | --- | --- |
| ① | **双计去重**（实为三计） | 列表层：`listTodayDue` 补两条排除（`status !== 'done'`、`submissionStatus !== 'pending'`）；汇总层：头部 N 由「三组相加」改为「三组按 `task.id` 取并集」（下沉为纯函数 `countVisibleFocusTasks`） |
| ② | **「待你审核」站内通知** | `completeTask` 末尾向 `task.reviewerIds` 派发 `review.pending`；新增未读级去重写入器 `pushNotificationOnce`（完成 → 重开 → 再完成不刷屏）；同步三处类型映射（label / icon / 注释登记） |

**范围外（显式不做）**：撤回入口、非 `done` 的既存 `pending` 收口、详情页标签统一 / 重构、「今日到期」加 `assigneeId` 过滤、种子 `notif-002` 纠正。

---

## 关键决策

- **判定「待审中」只能用 `submissionStatus === 'pending'`，禁用 `status`** —— 种子 `task-014` / `task-015` 是 `in_progress` + `pending`，只排除 `done` **一条都修不掉**。
- **必须按 `task.id` 取并集** —— 只在 `listTodayDue` 加排除条件**不足以**消除与「临期预警」的重叠；并集口径一次覆盖三组全部重叠。
- **「未读」判据 = `readAt === null`**（不是 `status === 'sent'`）；去重命中时**不消耗** `nextId` 序号。
- **`includeReview === false`（member）⇒ `pendingReview` 组整组不进并集**，不是「并集后再减 1」。
- **文档错误闭环**：设计文档原写 `completeTask('task-001')`，但 `todo → done` 非法（`TASK_TRANSITIONS.todo` 不含 `'done'`）⇒ 实现改用 `task-004`，并回改 ARCH-3 v1.1 / PRD-3 v1.1。

---

## 交付概览

| 项 | 值 |
| --- | --- |
| 交付状态 | ✅ **可验收**（QA 最终判定 `NoOne`） |
| 源码改动 | **5 改 + 1 新增**（`focus.ts` 新增） |
| 新增测试 | 3 个文件（工程师 1 + QA 2） |
| `tsc --noEmit` | **exit 0** |
| 全量测试 | **31 套件 / 502 用例全绿**（基线 28 / 445） |
| 浏览器 E2E | **9 项关键断言全 PASS**，控制台 **0 error** |
| 已知问题 | P0 × 0、P1 × 0、P2 × 2（QA 已自修）、P3 × 3（登记不修） |
| 新增依赖 | **0** |

**浏览器实证亮点**：头部「共 10 项待处理」经**独立复算**吻合（5+4+5−3−1 = 10）；完成 → 重开 → 再完成后未读数**不变**且通知时间戳**未被刷新**（证明命中去重、复用原记录）；「待你审核」图标字形 `U+F186` = **`inbox`**（非 `bell` 兜底）。

---

## 文件清单

**源码**
- `apps/mobile/src/utils/focus.ts`（新增）
- `apps/mobile/src/services/task.service.ts`
- `apps/mobile/src/data/index.ts`
- `apps/mobile/src/types/domain.ts`
- `apps/mobile/src/screens/NotificationsScreen.tsx`
- `apps/mobile/src/screens/TodayFocusScreen.tsx`

**测试**
- `apps/mobile/tests/increment3-dedup-notify.test.ts`（新增）
- `apps/mobile/tests/increment3-qa.test.ts`（新增）
- `apps/mobile/tests/increment3-notify-screen.test.tsx`（新增）

**文档**
- `docs/mobile-app/PRD-mobile-increment-3.md`（v1.2）
- `docs/mobile-app/ARCH-mobile-increment-3.md`（v1.1）
- `docs/mobile-app/QA-mobile-increment-3.md`（第 1~2 轮）
- `docs/mobile-app/DELIVERY-mobile-increment-3.md`（本增量交付说明）
- `docs/mobile-app/PRD-mobile-increment-2.md`（v1.2）· `ARCH-mobile-increment-2.md`（v1.5）

**截图**：`screenshots/mobile/inc3-01-focus-dedup.png`、`inc3-02-notify-pending.png`、`inc3-03-notify-dedup.png`

---

## 用户下一步

1. 浏览器验收：**`http://127.0.0.1:4175/`**（增量 3，`dist-v6`）—— 演示账号 `zhangwei@example.com / openschedule`。
2. 对照旧版：`4174` = 增量 2（`dist-v5`）、`4173` = 增量 1（`dist-v4`），三端口并行存活。
3. 右滑手势请在**真机 / 模拟器**复验（桌面浏览器为已知盲区）。
4. `dist-v4` / `dist-v5` 不需要对比时可手动删除。
