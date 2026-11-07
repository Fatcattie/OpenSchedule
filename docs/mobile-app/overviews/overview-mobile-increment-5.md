# OpenSchedule 移动端 · 增量 5 交付概览

> 日期：2026-09-27 · 交付人：齐活林（交付总监）· 路径：`apps/mobile`
> 一句话：**补齐「提报 / 审核」闭环最后三处缺口** —— 撤回完成提报后审核人终于能收到「撤回提醒」；`submissionStatus` 的写入首次有了唯一守卫；通知类型三处映射补齐 `review.withdrawn`。

---

## 做了什么

| # | 事项 | 结论 |
| --- | --- | --- |
| **B1** | 撤回完成提报后**通知审核人** | **做** —— 新增 `withdrawCompletionAndNotify` 包装入口（向**撤回前**全部审核人各派发 1 条「撤回提醒」），屏幕改调它 |
| **B2** | `withdrawSubmission` 加主体守卫 | **做**（**纯加固**）—— 非提报记录抛 40302；唯一调用点数据源已过滤 ⇒ 用户不可达 |
| **B3** | 提报状态机收口 | **做** —— `SUBMISSION_TRANSITIONS` 修正为**实读反推的真实可写入集合** + 新增唯一守卫 `assertSubmissionTransition` + 接入 **7 处**赋值点 |
| **B4** | 通知类型注释补全 | **做**（**纯注释**）—— `domain.ts:98` 补成完整 8 项清单 |

> **为什么必须新增包装函数而不是「在 `withdrawCompletion` 里加一行通知」**：「`withdrawCompletion` 零通知」被 **4 条断言 + K24** 锁定，且 `pushNotificationOnce` **含子串** `pushNotification` ⇒ **改名无法规避**。这是**真正的分层组合**，不是为绕测试而造的 API。

---

## 关键决策

- **分层唯一入口（K33）**：`withdrawCompletion` = 纯状态迁移、零通知（函数体**零改动**）；`withdrawCompletionAndNotify` = 迁移 + 通知副作用（**唯一派发点**）；屏幕**只准**调包装函数。
- **🔴 K38 —— 包装函数的「定义位置」是硬约束**（本增量风险最高、最不直观的一条）：全仓有 2 处源码切片断言，以 `[indexOf(withdrawCompletion), indexOf(reviewSubmission))` 取「`withdrawCompletion` 函数体」并断言 `not.toContain('pushNotification')`。包装函数体含 `pushNotificationOnce` ⇒ **若插在两者之间，会同时打破 2 个套件**。**必须定义在 `reviewSubmission` 之后**。实测位置链：`:1018` < `:1076` < `:1169` ✅
  > 此坑**主理人与 PM 均未识别**，由架构师实读测试源码时发现。
- **双重时序陷阱（K28）**：`applyClearedReviewState` 会清空 `reviewerIds` 与 `submissionStatus` ⇒ 两处快照**都必须在清理之前**取，否则「接收人退化为空（零通知）」或「守卫读到 `null` 误抛 40302」。
- **实现姿势（K34）**：先快照 → 后迁移 → **成功后**派发 ⇒ 撤回失败（40302 / 40901）**零通知、零副作用**。
- **表修正的诚实定性**：`SUBMISSION_TRANSITIONS` 原是**死表**（全仓零运行时调用者）⇒ 修正对运行时**零影响**；真正产生行为的是**守卫接入**，且对既有 7 条链路**逐条放行、零回归**。

---

## 交付概览

| 项 | 值 |
| --- | --- |
| 交付状态 | ✅ **可验收**（QA 判定 `NoOne`，**第 1 轮收敛**） |
| 源码改动 | **5 改 / 0 新增文件**（其中 2 处为**纯声明式 / 注释，零行为变更**） |
| 新增测试 | 2 个文件（工程师 31 + QA 51 = **82 用例**） |
| `tsc --noEmit` | **exit 0** |
| 全量测试 | **35 套件 / 668 用例全绿**（基线 33 / 586） |
| AC / INV | **17 / 17** · **12 / 12** |
| 浏览器 E2E | **8 / 8 PASS**，控制台 **0 error** |
| 已知问题 | P0 × 0、P1 × 0、P2 × 0；P3 × 6（登记不修） |
| 新增依赖 | **0** |

**浏览器实证亮点**：完成任务 → 审核人收到「待你审核」（`inbox`）→ 撤回 → 任务回到**进行中** → 审核人收到 **「提报已撤回」**（`corner-up-left`）；**对照组**：审核人打开**他人**的待审任务 ⇒ 「撤回提报」入口**隐藏**。

---

## 文件清单

**源码**
- `apps/mobile/src/utils/submission.ts`（`SUBMISSION_TRANSITIONS` 修正）
- `apps/mobile/src/services/task.service.ts`（`assertSubmissionTransition` + 7 处接入 + `withdrawSubmission` 守卫 + **新增** `withdrawCompletionAndNotify`）
- `apps/mobile/src/screens/TaskDetailScreen.tsx`（`:296` 改调包装函数）
- `apps/mobile/src/types/domain.ts`（`review.withdrawn` label + `:98` 注释补全）
- `apps/mobile/src/screens/NotificationsScreen.tsx`（`review.withdrawn` icon）

**测试**
- `apps/mobile/tests/increment5-closure.test.ts`（新增，31 用例）
- `apps/mobile/tests/increment5-qa.test.ts`（新增，51 用例）
- `apps/mobile/tests/submission-flow.test.ts`（**授权 1 条 expect**）
- `apps/mobile/tests/increment4-qa.test.ts`（**授权 2 条 expect**）
- `apps/mobile/tests/increment3-qa.test.ts`（QA 自修时刻鲁棒，断言文本未改）

**文档**
- `docs/mobile-app/PRD-mobile-increment-5.md`（v1.0）
- `docs/mobile-app/ARCH-mobile-increment-5.md`（v1.0，K27~K38）+ 时序图 / 类图 `.mermaid`
- `docs/mobile-app/QA-mobile-increment-5.md`（第 1 轮）
- `docs/mobile-app/DELIVERY-mobile-increment-5.md`

**截图**：`screenshots/mobile/inc5-01-notify-withdrawn.png`、`inc5-02-control-non-submitter.png`、`inc5-03-withdraw-entry.png`、`inc5-04-withdraw-confirm.png`

---

## 用户下一步

1. 浏览器验收：**`http://127.0.0.1:4177/`**（增量 5，`dist-v8`）—— 演示账号 `zhangwei@example.com / openschedule`。
   - 建议路径：我的待办 → 「接口联调环境」→ 标记完成 → 返回 → 铃铛（应见「待你审核」）→ 撤回提报 → 返回 → 铃铛（应见**「提报已撤回」**）。
   - ⚠️ **请勿用地址栏跳转 / F5**：会重置演示数据（本次验收曾因此误判，已记入 skill）。
2. 对照旧版：`4176` = 增量 4、`4175` = 增量 3、`4174` = 增量 2、`4173` = 增量 1，**五端口并行存活**。
3. `dist-v4` ~ `dist-v8` 不需要对比时可手动删除（沙箱禁止批量删除）。
4. 后续候选（均来自已登记限制）：① 撤回后**召回**已发出的「待你审核」通知；② 通知偏好开关落地；③「撤回 → 重提」去重策略细化。
