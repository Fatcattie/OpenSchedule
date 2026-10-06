# OpenSchedule 移动端 —— 增量 2 交付总结（接通 `completeTask` → 待审核 断链）

> 交付日期：2026-09-27　|　范围裁定人：用户（「仅 completeTask 断链」档位）　|　交付状态：**完成**
> 增量 SOP：许清楚（PRD）→ 高见远（架构 + 任务分解，v1.0/v1.1/v1.2）→ 寇豆码（实现）→ 严过关（QA）

---

## 一、TL;DR

**成员完成任务后不再「凭空消失」——任务进入「待我审核」队列，由审核人通过/驳回，形成与「新事项提报」对称的第二条审核闭环。**

一句话概括本次改动：`completeTask` 末尾写入提报态三字段，并在**每一条退出 `done` 的路径**上保证审核态被正确清理，使 `listPendingReview` 的供给从「只有种子数据」变为「真实操作驱动」。

---

## 二、交付概览

| 项 | 结果 |
| --- | --- |
| 交付状态 | ✅ 完成 |
| 需求池 | **6 条**：P0 × 4（全部交付）、P1 × 1（交付）、P2 × 1（登记不交付，用户裁定） |
| 验收标准 | **AC 13 / 13 PASS**（PRD §6.1） |
| 硬不变式 | **INV 4 / 4 PASS**（PRD §6.2 + ARCH v1.1 INV-4） |
| 回归清单 | **15 / 15 全绿**（PRD §6.3 九项 + ARCH §8.1b 六项） |
| 自动化测试 | **28 套件 / 445 用例全绿**（基线 25 / 383 → +3 套件 / +62 用例） |
| 类型检查 | `npx tsc --noEmit` → **exit 0**（strict） |
| 新增依赖 | **0**（`reanimated` / `gesture-handler` 仍无命中） |
| 缺陷 | **P0 / P1 / P2 = 0**；P3 × 3（2 条为已登记已知限制、1 条为文档口径偏差） |
| QA 判定 | **`NoOne`**（源码无 Bug、测试代码无 Bug、门槛达标，第 1 轮即通过，未消耗第 2 轮） |
| 改动规模 | 修改源码 **4 个文件**、新增测试 **3 个文件**、修改测试 **1 个文件（仅标题）** |

---

## 三、需求池交付明细（PRD §5）

| 编号 | 内容 | 级别 | 状态 | 验收 |
| --- | --- | --- | --- | --- |
| **M3-P0-01** | `completeTask` 写入提报态六字段（`submissionStatus='pending'` / `reviewRequired=true` / `reviewerIds=allManagerIds()` / `reviewNote=null` / `reviewedBy=null` / `reviewedAt=null`），**不改 `source`** | P0 | ✅ 交付 | AC-01 / AC-02 / AC-10 / AC-11 |
| **M3-P0-02** | 撤销「完成」同步回滚审核态（六字段 + `completedAt`，任务彻底退出队列） | P0 | ✅ 交付 | AC-05 / AC-06 |
| **M3-P0-03** | 完成提报被驳回清空 `completedAt`（仅 `'completion'` 分支），确立 INV-1 | P0 | ✅ 交付 | AC-04 / INV-1 |
| **M3-P0-04** | 「待我审核」按 `resolveApproveBranch` 分叉展示「完成待审」vs「提报待审·新任务/新项目」 | P0 | ✅ 交付 | AC-09 |
| **M3-P1-01** | 完成提报卡片视觉区分（状态标签配色 + 提交人副文案） | P1 | ✅ 交付 | AC-09 附加项 |
| **M3-P2-01** | 提交后向审核人推送「待你审核」通知 | P2 | ⏸ **登记不交付**（用户裁定不提前） | — |
| **（追加）T02b** | **「离开 `done`」退出路径清理审核态**（`reopenTask` / `moveTask`） | **P0（主理人追加）** | ✅ 交付 | AC-13 |

> **T02b 是主理人在架构评审阶段追加的范围**，详见 §六「过程决策」第 1 条。

---

## 四、交付物清单

### 4.1 修改源码（4）

| 文件 | 改动要点 |
| --- | --- |
| `apps/mobile/src/utils/submission.ts` | 新增 `UndoReviewReset` / `ReviewItemView` 类型 + 4 个纯函数：`createClearedReviewState()`（**审核态清理字段包唯一构造点**）、`resolveUndoReviewReset()`、`shouldClearReviewOnLeaveDone()`、`resolveReviewItemView()` |
| `apps/mobile/src/services/task.service.ts` | ① `completeTask` 写六字段；② `undoCompletion` 由单行赋值改为**三态**（经 `resolveUndoReviewReset`）；③ `reviewSubmission(reject)` 在 `'completion'` 分支清 `completedAt`；④ `moveTask` / `reopenTask` 按守卫清理审核态；⑤ 新增私有 `applyClearedReviewState`；⑥ `UndoCompletionInput` 补三态 JSDoc |
| `apps/mobile/src/components/TaskCard.tsx` | 新增**可选** `footer?: ReactNode` 槽（渲染于 `metaRow` 之后，`marginTop: spacing.xs`） |
| `apps/mobile/src/screens/TodayFocusScreen.tsx` | ① `handleUndo` 的 `kind==='complete'` 传 `submissionStatus: null`（`'approve'` 仍传 `'pending'`）；② `review` 分组经 `resolveReviewItemView` + `userMap()` 注入 `footer`；③ `due` / `approaching` **不传** |

### 4.2 测试（3 新增 + 1 修改）

| 文件 | 归属 | 用例数 | 说明 |
| --- | --- | --- | --- |
| `apps/mobile/tests/increment2-completion.test.ts` | 工程师 | **39** | 纯函数全分支 + service 全链路（AC-01~07/10/11、INV-1~3、AC-13） |
| `apps/mobile/tests/increment2-qa.test.ts` | QA | **19** | 独立复核：AC-13 守卫时机与反向、K3 方向性、INV 逐条、AC-04 分支隔离、异常码无副作用 |
| `apps/mobile/tests/increment2-focus-footer.test.tsx` | QA | **4** | 组件级：K9 承载面（`due`/`approaching` 不传 `footer`）、AC-09 两类条目同屏可区分 |
| `apps/mobile/tests/round2-regression.test.ts` | 工程师 | 0（**仅改标题**） | `:62` 用例标题改为「不传 `submissionStatus` 时 service 保持原值（调用方须显式传 `null` 才能回滚）」，**断言一字未动** |

### 4.3 过程文档（3）

| 文件 | 行数 | 归属 |
| --- | --- | --- |
| `docs/mobile-app/PRD-mobile-increment-2.md` | 279 | 许清楚（产品经理） |
| `docs/mobile-app/ARCH-mobile-increment-2.md` | 621（v1.2） | 高见远（架构师） |
| `docs/mobile-app/QA-mobile-increment-2.md` | 577 | 严过关（QA 工程师） |

---

## 五、核心设计：双轨状态模型与三态契约

### 5.1 双轨状态（本次唯一新增的语义约定）

| 轨道 | 字段 | 取值 | 本次是否变更 |
| --- | --- | --- | --- |
| **A · 执行状态** | `status` | `todo` → `in_progress` → `done`（另有 `blocked` / `cancelled`） | ❌ 不变 |
| **B · 验收状态** | `submissionStatus` | `null`（未提交）→ `pending` → `approved` \| `rejected` | ✅ **本次接通写入与回滚** |

**判定口径（K4，硬约定）**：「完成提报」**只能**用 `resolveApproveBranch(task) === 'completion'` 判定，**禁止**用 `task.source` 或 `task.status`。
原因：① `completeTask` **不改 `source`**（保持 `published`）⇒ 产生 `source !== 'submission'` 但 `submissionStatus === 'pending'` 的新组合；② 种子 `task-014` / `task-015` 的 `status === 'in_progress'`（不是 `done`）⇒ `status` 不可作依据。

### 5.2 撤销入参的三态契约（最易写错处）

`UndoCompletionInput.submissionStatus`：

| 取值 | 语义 | 使用场景 |
| --- | --- | --- |
| `undefined`（不传） | **不动**提报态 | 向后兼容；`round2-regression.test.ts:19-41/:62-69` 依赖此态 |
| `null` | **清理审核态**（六字段全清） | 撤销「完成」 |
| `'pending'` | 仅把 `submissionStatus` 置回 `'pending'`，**不得**复位 `reviewRequired` / `reviewerIds` | 撤销「审核通过」 |

> ⚠️ **方向相反**：撤销「完成」→ 清空审核态（任务退出队列）；撤销「审核通过」→ **保留**审核态（任务**重新回到**待审，审核人必须仍能看到它）。若把后者写成清空，任务会从待审队列**永久消失**。

### 5.3 硬不变式

| # | 不变式 |
| --- | --- |
| INV-1 | `completedAt != null ⟺ status === 'done'` |
| INV-2 | `submissionStatus === 'pending'` ⇒ `reviewRequired === true` 且 `reviewerIds` 非空 |
| INV-3 | `submissionStatus ∈ {null, 'approved', 'rejected'}` ⇒ 不在 `listPendingReview` 队列 |
| INV-4 | `submissionStatus === null` ⇒ 审核态三字段已清理（`reviewRequired=false` / `reviewerIds=[]` / `reviewNote=null`） |

---

## 六、过程决策（主理人裁定）

| # | 决策 | 背景 | 裁定与理由 |
| --- | --- | --- | --- |
| 1 | **追加 T02b：「离开 `done`」的退出路径必须清理审核态** | 架构师在 D3 发现：任务详情页/看板的「重开」（`reopenTask`）与状态菜单（`moveTask`）是完成提报的**第二条退出路径**，均不清审核态 ⇒ 任务带着 `status='in_progress'` + `submissionStatus='pending'` 滞留待审队列，审核人可通过它把**未完成**的任务误标为 `done`。架构师 v1.0 曾裁定「本次不改（范围铁律）」 | **推翻，纳入本次**。理由：① 与 R1 是**同一缺陷类**（R1 的裁定原文即「否则任务会永久滞留审核队列」）；② 这是本次变更**直接引入**的新泄漏（变更前 `completeTask` 不写提报态，该路径无审核态可泄漏），属「把断链接通**接对**」的必要组成，非「顺手优化」；③ 演示中可达且后果真实；④ 成本约 4 行 + 5 条用例 |
| 2 | **守卫收窄**（只收口本次引入的 `done` 泄漏） | 架构师 v1.1 自主裁定并请主理人确认 | **确认收窄**。种子 `task-014`/`task-015`（`in_progress` + `pending`，**非由 `done` 迁出**）的既存缺口**明确不修**，登记为已知限制（ARCH §9.2-P6）—— 属接通前既存问题，收口会扩大范围 |
| 3 | **6 字段清理包**（含 `reviewedBy` / `reviewedAt`） | PRD AC-05 原文只列 5 字段；架构师建议统一为 6 字段单一构造点 | **确认采纳**。`pending` 态下这两字段恒为 `null`（`reviewSubmission` 的 `'completion'` 分支从不写），故**行为等价、回归面为零**；统一构造点可消除「两份字段清单漂移」的维护风险 |
| 4 | **Q3-11（完成提报显式「撤回」入口）** | PRD §7.2 待拍板 | **不做**。`withdrawSubmission` 会把 `status` 置 `'cancelled'`，对**正式任务**是错误语义（任务被「取消」而非「回到未提交」）；完成提报的唯一退出路径是「撤销完成」。属范围扩张 |
| 5 | **Q3-12（「待你审核」通知提前）** | PRD §7.2 待拍板 | **不提前**，保持 P2 不交付。审核结果闭环已可用；演示环境会「通知自己」；需处理重复提交去重 |

---

## 七、质量验证证据

### 7.1 自动化测试（主理人独立复跑）

```
$ npx tsc --noEmit
TSC_EXIT=0

$ npx jest --config jest.config.js
Test Suites: 28 passed, 28 total
Tests:       445 passed, 445 total
Time:        26.602 s

$ grep -rn "reanimated\|gesture-handler" src
（无命中）
```

### 7.2 AC 与 INV 通过率（QA 独立验证）

| 维度 | 结果 |
| --- | --- |
| AC-01 ~ AC-13 | **13 / 13 = 100%** |
| INV-1 ~ INV-4 | **4 / 4 = 100%** |
| PRD §6.3 九项 + ARCH §8.1b 六项回归 | **15 / 15 全绿** |

### 7.3 三个关键正确性验证点（QA 独立设计用例）

1. **AC-13 守卫求值时机** —— 源码实读确认守卫在改写 `task.status` **之前**求值（`task.service.ts:301` / `:371`）。QA 用「顺序敏感布尔式」用例证明：`{done, pending} + 目标 todo → true`、`{todo, pending} + 目标 todo → false`；若写在赋值之后则条件恒假、清理永不触发。反向否决（`todo→in_progress`、`in_progress→done`）均正确不清理。
2. **K3 方向性** —— 撤销「审核通过」（传 `'pending'`）后 `reviewRequired===true`、`reviewerIds===['user-001']` **未被复位**，`listPendingReview` **仍含**该任务 ⇒ 未发生「任务从待审队列消失」的反向缺陷。
3. **既有断言零改动** —— `apps/mobile` 未被 git 跟踪（`git diff` 不可用），改用双重证据：① 除 `round2-regression.test.ts` 外全部 25 个既有测试文件 mtime ≤ 10:38（远早于施工窗口 16:46–16:54）；② PRD §6.3 引用的行号 `:19-31/:33-41/:43-60/:62-69/:73-85` 与文件逐一对齐。

### 7.4 回归红线

| 红线 | 断言 | 结果 |
| --- | --- | --- |
| `tests/services.test.ts:168-184` | `reviewSubmission('task-014','approve')` → `status='done'`；`reviewSubmission('task-015','reject',…,'说明不充分')` → `status='in_progress'` + `reviewNote` | ✅ 全绿（定向复跑 `-t "reviewSubmission"` → 2 passed） |
| `tests/round2-regression.test.ts` | 撤销链路 5 组断言（含陈旧 `version` → 40901、非法目标状态 → 40902） | ✅ 全绿 |

### 7.5 真实浏览器全路由回归（Playwright，390×844，产物 `dist-v5`）

`TaskCard` 是跨页面复用组件（3 处调用点：`WorkspaceScreen:352` / `TodayFocusScreen:470` / `BoardScreen:197`），本次为其新增了可选 `footer` prop，故对全部路由做了一轮渲染回归。

| 路由 | 渲染出的真实内容（截取） | 结果 |
| --- | --- | --- |
| `/workspace` | 「下午好，张伟」+ 我的待办 共 7 条 | ✅ |
| `/today` | 「今日聚焦」共 18 项待处理 · 今日到期 7 / 待我审核 4 / 临期预警 7 | ✅ |
| `/projects` | 「项目看板」共 2 个项目 | ✅ |
| `/projects/project-001` | 「官网改版 2026 Q3」完成 17% · 2/12 个任务 | ✅ |
| `/time` | 「时间容器」08:00–20:00 · 空闲 2 小时可排期 | ✅ |
| `/me` | 「我的」身份、偏好与退出 | ✅ |
| `/me/notification-settings` | 「通知偏好」按事件类型选择接收渠道 | ✅ |
| `/me/about` | 「关于」v1.0.0 | ✅ |
| `/submit` | 「新建事项」将直接创建，无需审核 | ✅ |
| `/create` | 「创建事项」项目 / 任务 | ✅ |
| `/personal-plan` | 「个人计划」共 3 项个人任务 | ✅ |
| `/my-submissions` | 「我的提报」2 条（已通过 / 已驳回） | ✅ |
| `/notifications` | 「通知」4 条未读 | ✅ |
| `/task/task-001` | 「任务详情」官网改版 2026 Q3 · 需求文档评审 | ✅ |

**结果：14 / 14 PASS**（URL 全部命中目标路由，无一被踢回登录页；无空白页、无错误边界）。扫测期间 `goto` **未产生任何新控制台条目** ⇒ 零新增 console error。

> **浏览器验收的两处边界（如实声明，不作通过处理）**：
> ① **右滑手势不可复现** —— 本轮两次尝试（`elementFromPoint` 派发 / 「标题→向上找卡片容器」派发合成 `TouchEvent`）均未触发 `PanResponder`。注意一个**假阳性陷阱**：`SwipeableRow` 的动作按钮（「完成」/「通过」/「驳回」）**始终存在于 DOM** 只是被卡片盖住，故用 `querySelectorAll` 查到这些文案**不能**证明滑动已展开 —— 必须看截图。**「完成任务 → 进入待审队列」的写路径由 AC-01/AC-02 与 QA 19 条独立用例在 service 层覆盖，UI 手势留待真机手测。**
> ② **首屏被 AI 提议卡占满** —— 「待我审核」分组需先滚动才可见（已用 `scrollTop = scrollHeight` 处理，截图 `inc2-03-review-cards.png`）。

---

## 八、QA 缺陷闭环

| 严重度 | 数量 | 明细 |
| --- | --- | --- |
| **P0** | **0** | — |
| **P1** | **0** | — |
| **P2** | **0** | — |
| P3 | 3 | ① 种子 `task-014/015`（非由 `done` 迁出）经 `moveTask` 不清理 —— 已登记（ARCH §9.2-P6），本次范围外；② 「今日到期 / 待我审核」双计 —— 已登记（PRD §8-2 / Q3-5），本次不处理；③ ARCH §3.4 称 `TaskCard` 有「5 处调用点」，实测 `<TaskCard` 为 **3 处**（纯文档口径偏差，不影响零回归结论） |

**QA 智能路由判定：`NoOne`** —— 源码无 Bug、测试代码无 Bug、工程门槛达标，**第 1 轮即通过，未消耗第 2 轮**。
QA 自查披露：其新增用例首轮暴露 **2 处 QA 自身缺陷**（`INV-3` 对同一任务重复 `completeTask` 触发 40902；标题 `待审核：…` 与标签 `已完成` 拼接误命中 `完成待审`），**已自行修正，未外溢至源码**。

---

## 九、团队协作记录（增量 SOP）

| 阶段 | 成员 | 产出 | 主理人核验 |
| --- | --- | --- | --- |
| 需求 | 许清楚（产品经理） | `PRD-mobile-increment-2.md`（279 行）：6 条需求、12 条 AC、3 条 INV、9 项回归清单、10 项裁定、2 项待拍板 | ✅ 落盘核验 + 实读 §1.3/§4/§5/§6/§7/§8 |
| 架构 | 高见远（架构师） | `ARCH-mobile-increment-2.md` v1.0（453 行）：5 文件改动、T01~T06、K1~K12、零依赖确认、D1~D4 结论 | ✅ 落盘核验 + 实读 §5/§7 |
| 架构修订 | 高见远（架构师） | **v1.1**（601 行）：主理人裁定纳入 T02b，改写 K8/K1、新增 AC-13/INV-4、新增 §4.4 链路④ | ✅ 采纳其 2 项自主裁定（守卫收窄、6 字段包） |
| 实现 | 寇豆码（工程师） | 4 源码 + 1 新测试（39 用例）；`IS_PASS: YES`；**发现并修正 ARCH §3.3b 的实质错误** | ✅ 独立复跑 tsc/jest + 实读 `moveTask:300-313`、`completeTask:337-346`、`reopenTask:371-376`、`undoCompletion:414-419`、`reviewSubmission:971-975` |
| 架构修订 | 高见远（架构师） | **v1.2**（621 行）：修正 §3.3b 守卫求值时机、§4.4 时序图补注、K8 改「迁移前」 | ✅ 落盘核验（621 行 / 64918 B） |
| 测试 | 严过关（QA 工程师） | `QA-mobile-increment-2.md`（577 行）+ 2 个新测试文件（23 用例）；判定 `NoOne` | ✅ 独立复跑 28 套件 / 445 用例全绿 |

---

## 十、已知限制与遗留

1. **演示环境「自审」** —— 演示账号张伟（`user-001`）**既是 manager 又是唯一可登录账号**。按裁定，完成任务后该任务会进入**自己的**「待我审核」队列 ⇒ 演示中会出现「自己审自己」。真实 RBAC 下应由他人审核（`reviewerIds` 含 `user-004` 陈明，即体现该设计意图）。**演示数据限制，非功能缺陷。**
2. **非 `done` 的既存 `pending` 缺口不修** —— 种子 `task-014` / `task-015` 处于 `in_progress` + `pending`（非由 `done` 迁出），在详情页「退回待办」后仍会留在待审队列。属**接通前既存**问题，本次按范围铁律不处理（ARCH §9.2-P6）。
3. **「今日到期 / 待我审核」双计** —— `listTodayDue` 仅排除 `cancelled`，故「已完成待审」的任务会同时出现在两个分组，头部汇总 `visibleTotal` 会重复计数。本次接通后会**放大**（每完成一条任务即多一条重复）。**本次不处理**（PRD Q3-5）。后续建议：在 `listTodayDue` 增加 `status !== 'done'` **与** `submissionStatus !== 'pending'` 两条排除条件，并把 `visibleTotal` 改为按 `task.id` 取并集。

   > ⚠️ **勘误（2026-09-27 增量 3 期实测更正，两处）**
   >
   > **(1) 关于测试影响的说法有误。** 本条原文曾称「两者均需同步更新 `today-focus-gate.test.tsx:205/219` 的断言」。经实测，该文件的聚焦数据全部来自 `jest.mock` 替身（`@/hooks` 的 `useAsync` 替身返回 `mockFocus`，`:97-120`；`beforeEach:170-175` 清空三分组），**不含种子数据**；`:219` 的 `reviewTask`（`id='task-901'`）只写入 `pendingReview` 一个分组，无可去重项 ⇒ 两条断言的期望值**仍为 `共 0 项` / `共 1 项`，无需修改**。
   > **错误依据的唯一真实出处是 `PRD-mobile-increment-2.md:265`（§8-2 末句），已由产品经理出 v1.1 勘误更正。**（本节初版曾把出处误记为「ARCH §9.2-P6 / PRD-increment-2 §8-2」两处；经架构师实测复核，**ARCH-2 §9.2-P6 从未包含该表述**，属主理人的二次误引，特此更正。）
   >
   > **(2) 关于「双计」的量级与修法有误。** 原文用「**或**」把两条路线当作等价替代，实际不等价：
   > - 只给 `listTodayDue` 加排除条件，切不断「临期预警 ∩ 待我审核」；
   > - 种子 `task-014` / `task-015`（`status='in_progress'` + `submissionStatus='pending'` + `dueAt` 为当日）**会同时进入三个分组** ⇒ **「双计」实为「三计」**；
   > - 唯一能一次覆盖三组重叠、且不依赖各分组过滤条件的方案是 **「`visibleTotal` 按 `task.id` 取并集」**。
   >
   > **教训：把「某测试会受影响」写进文档前，必须实际打开该测试确认其数据来源（真种子 vs mock 替身）；引用他人文档的结论时，必须回到原文核对出处，不要二次转述。**
4. **完成提报无「撤回」路径** —— 唯一退出路径是「撤销完成」，依赖 UndoToast 窗口或显式撤销入口。若需要「已过撤销窗口后仍能撤回」，须走 Q3-11（本次不做）。
5. **`SUBMISSION_TRANSITIONS` 未覆盖 `approved → pending`** —— 该表将 `approved` 定义为终态，但「撤销审核通过」事实上会把 `submissionStatus` 由 `approved` 置回 `'pending'`（`undoCompletion` 不经 `canTransition` 校验）。本次**只做文档层面承认**，不改该表（该表只服务「新事项提报」）。后续如需统一，建议为完成提报单列 `COMPLETION_TRANSITIONS`。
6. **单用户演示 / 内存库刷新复位** —— `authService.login` 恒返回演示账号；mock 数据在内存中，整页刷新即回到种子状态。故端到端验证必须在**单会话内用应用内导航**完成。沿用增量 1 遗留，本次不处理。
7. **拖拽手势层无自动化测试** —— 沿用增量 1 遗留，本次不处理。
8. **ARCH 文档一处口径偏差** —— §3.4 称 `TaskCard` 有 5 处调用点，实测 3 处（QA P3-③）。
9. **多余构建产物待清理** —— 现有 `dist-v4`（增量 1）、`dist-v5`（增量 2）。沙箱安全策略拦截批量删除（单目录 > 50 文件），**需手动清理**。

---

## 十一、用户下一步建议

1. **浏览器验收增量 2 新链路（推荐）** —— 已在 `http://127.0.0.1:4174` 起好服务（产物 `apps/mobile/dist-v5`）。建议路径：
   `今日聚焦 → 今日到期 → 右滑一条任务 → 完成 → 切到「待我审核」→ 应看到「完成待审」标签 + 提交人副文案 → 右滑「通过」`。
   （增量 1 的预览仍在 `http://127.0.0.1:4173`，未受影响。）
2. **真机体验** —— `cd apps/mobile && npm start`，Expo Go 扫码。
3. **接真实后端** —— 设 `EXPO_PUBLIC_USE_MOCK=false`；本次未新增 service 方法，`// TODO(real-api)` 已同步反映 `submissionStatus` 三态语义。
4. **增量 3 候选（按优先级）** —— ① 双计去重（已知限制 3）；② 「待你审核」通知（`M3-P2-01`）；③ 完成提报的显式「撤回」入口（Q3-11）；④ 收口非 `done` 的既存 `pending` 缺口（已知限制 2）；⑤ `COMPLETION_TRANSITIONS` 补表（已知限制 5）。
5. **清理构建残留** —— 删掉 `apps/mobile/dist-v4`（如需保留增量 1 预览则留）。
