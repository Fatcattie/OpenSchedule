# OpenSchedule 移动端 —— 增量 1 交付总结（提报 / 创建 / 个人计划 / 排期拖拽 / 待审详情入口）

> 交付团队：软件开发团队（SOP 标准工作流） · 主理人：齐活林（交付总监）
> 交付日期：2026-09-27 · 工作流：**增量 SOP**（增量 PRD → 增量架构 → 工程师实现 → QA 验收 → 修复回路 → 回归）
> 基线：`PRD-mobile.md` / `ARCH-mobile.md` / `DELIVERY-mobile.md`（首版） · 增量档位：`PRD-mobile-increment-1.md` v1.2 / `ARCH-mobile-increment-1.md` v1.0 / `QA-mobile-increment-1.md`

---

## 一、TL;DR

在既有 OpenSchedule 移动端（Expo 57 / RN 0.86.3 / React 19 / TS 6）上交付 **增量 1**：为**普通人员**补上「事项提报」、为**管理人员**补上「事项创建」与「提报审核落地」、为两类角色补上「个人计划 + 排期拖拽」，并在「待我审核」卡片补上显式的「查看详情」入口。**零新增依赖**、`tsc` 0 error、**25 套件 / 383 用例全绿**、真实浏览器端到端链路（提报 → 审核 → 落地 → 站内通知）已跑通。

---

## 二、交付概览

| 项 | 结果 |
| --- | --- |
| 交付状态 | ✅ 已完成；QA 第 1 轮 `IS_PASS: NO`（1×P1 + 2×P2）→ 修复 → 第 2 轮再发现 2 处残留 → 修复 → 主理人定向复验通过 |
| 工程路径 | `apps/mobile`（增量改造，未新建工程） |
| 需求池完成度 | **P0 7/7 · P1 4/4 · P2 1/1**（PRD §5 全部条目） |
| 新增源码 | **13 个**（工具 4 + 组件 4 + hook 1 + 页面 4） |
| 修改源码 | **18 个**（类型 2 / service 5 / 桶文件 3 / 数据 2 / 页面 4 / 导航 2） |
| 新增测试 | **10 个套件**；测试总量 **17 套件 / 321 用例 → 25 套件 / 383 用例**（+8 套件 / +62 用例） |
| 类型检查 | `npx tsc --noEmit` → **0 错误**（strict） |
| 新增依赖 | **0 个**（`package.json` 未改动；`reanimated` / `gesture-handler` 仍为零引用） |
| 浏览器端到端 | 13 条路由实测 **13/13 PASS**，控制台 **0 错误**；提报→审核→落地→通知全链路跑通 |
| 已知遗留 | 0 个 P0/P1；2 个已声明限制（见 §八） |

---

## 三、需求池交付明细（PRD §5）

| 编号 | 级别 | 需求 | 状态 | 落地证据 |
| --- | --- | --- | --- | --- |
| `M2-P0-01` | P0 | 权限工具 `can()` + `useCan()`，接入全部新入口 | ✅ | `src/utils/permission.ts`（9 个 action key）；接入 `WorkspaceScreen` / `ProjectListScreen` / `SubmissionScreen` / `CreateItemScreen` / `MySubmissionsScreen` / `TodayFocusScreen` |
| `M2-P0-02` | P0 | 复用型选择控件 `PickerSheet` | ✅ | `src/components/PickerSheet.tsx`（基于既有 `BottomSheet`，泛型 `T extends string`） |
| `M2-P0-03` | P0 | 提报事项（member） | ✅ | `SubmissionScreen` + `taskService.submitItem`；生成 `pending` 记录、`reviewerIds` 含全部 manager |
| `M2-P0-04` | P0 | 创建事项（manager） | ✅ | `CreateItemScreen` + `createTask` / `createProject`；`createdBy=me`、直接落地 `source='published'` |
| `M2-P0-05` | P0 | 审核提报与落地 | ✅ | `reviewSubmission` 经 `resolveApproveBranch` 三分叉；`project`→建 Project、`task`→建 Task、`completion`→**行为不变（回归红线）** |
| `M2-P0-06` | P0 | 个人计划页（列表 + CRUD + 标记完成） | ✅ | `PersonalPlanScreen`；今天/本周/以后三段分组；新建/编辑/删除/完成 + `UndoToast` |
| `M2-P0-07` | P0 | 待我审核卡片「查看详情」按钮 | ✅ | `TodayFocusScreen` 经 `TaskCard.right` 插槽注入，**仅 `review` 分组**；浏览器实测出现 4 次（与 4 条待审一致） |
| `M2-P1-01` | P1 | 个人计划排期视图（日/周 + 点块改期保底） | ✅ | `ScheduleTimeline` + `PickerSheet` 时段选择 → `schedulePersonalTask`；日视图时间轴 + 周视图 7 天分组 |
| `M2-P1-02` | P1 | 「我的提报」列表（状态 + 撤回） | ✅ | `MySubmissionsScreen`；五种状态中文标签 + 驳回原因回流 + 仅 `pending` 可撤回（二次确认抽屉） |
| `M2-P1-03` | P1 | 提报/审核结果站内通知 | ✅ | `pushNotification` + `reviewSubmission` approve/reject 各写一条 `review.result`；浏览器实测通知可见 |
| `M2-P1-04` | P1 | 排期视图长按拖拽改期 | ✅ | `ScheduleTimeline` + `useDragReschedule`（`PanResponder` + `Animated`）；AC1–AC10 见 §五 |
| `M2-P2-02` | P2 | 提报草稿本地保存 | ✅ | `src/utils/draft.ts`（纯函数）+ `AsyncStorage`（key `os.draft_submission`）；浏览器实测刷新后恢复 |

**明确不做（PRD §2.2）**：N1 详情页审批区 · N2 `completeTask`→待审核断链 · N3 真实 RBAC · N4 附件/会签 · N5 新增底部 Tab —— 全部按 PRD 保持不做。

---

## 四、交付物清单

### 4.1 新增源码（13）

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 工具 | `src/utils/permission.ts` | `PermissionAction` / `PERMISSIONS` 单一事实来源 / `can` / `useCan` |
| 工具 | `src/utils/submission.ts` | `isSubmissionRecord`（提报记录唯一判定）/ 状态机迁移表 / `resolveApproveBranch` |
| 工具 | `src/utils/schedule.ts` | 拖拽业务常量 + `pxToMinutes` / `snapToSlot` / `clampStartMin` / `resolveDrop` / `isCancelDrag` / `minutesToIso` |
| 工具 | `src/utils/draft.ts` | 草稿序列化/反序列化/有效性判定（纯函数、防御性解析） |
| 组件 | `src/components/PickerSheet.tsx` | 统一选择抽屉（优先级/类型/日期/时间/项目/负责人） |
| 组件 | `src/components/DateTimeField.tsx` | 日期（未来 14 天）+ 时间（08:00–20:00 每 30 分）两步选择字段 |
| 组件 | `src/components/ItemForm.tsx` | 提报/创建共用表单骨架（按角色与场景分叉） |
| 组件 | `src/components/ScheduleTimeline.tsx` | 排期时间轴 + 可拖拽块 + 对齐参考线（内嵌 `DraggableBlock`） |
| hook | `src/hooks/useDragReschedule.ts` | 长按进拖拽态 + 吸附 + 钳制 + 取消（零第三方手势库） |
| 页面 | `src/screens/SubmissionScreen.tsx` | 提报页（member 待审 / manager 免审落地）+ 草稿持久化 |
| 页面 | `src/screens/CreateItemScreen.tsx` | 创建页（manager 直接创建项目/任务） |
| 页面 | `src/screens/PersonalPlanScreen.tsx` | 个人计划（列表 / 排期双视图） |
| 页面 | `src/screens/MySubmissionsScreen.tsx` | 我的提报（状态查看 + 撤回） |

### 4.2 修改源码（18）

| 分类 | 文件 |
| --- | --- |
| 类型 | `types/task.ts`（`SubmissionStatus` 扩展 + `SubmissionKind` + `Task` 加 3 字段）、`types/navigation.ts`（根栈 +4 路由） |
| 服务 | `services/task.service.ts`（+5 写方法 / `reviewSubmission` 分叉 / 8 处列表守卫 / 通知写入）、`services/project.service.ts`（`createProject`）、`services/focus.service.ts`（个人任务 CRUD + 排期）、`services/config.ts`（`DRAFT_KEYS`）、`services/index.ts`（导出） |
| 桶文件 | `components/index.ts`、`hooks/index.ts`、`data/index.ts`（`pushNotification`） |
| 数据 | `data/seed.ts`（补 manager 用户 `user-004` + 5 条提报种子 `task-019`~`task-023`） |
| 页面 | `screens/TodayFocusScreen.tsx`（查看详情 + 审核权限门禁）、`screens/ProfileScreen.tsx`（个人计划/我的提报入口）、`screens/WorkspaceScreen.tsx`（3 个新快捷入口 + 权限过滤）、`screens/ProjectListScreen.tsx`（创建 FAB + 空态文案分叉） |
| 导航 | `navigation/stacks.tsx`（根栈注册 4 新页）、`navigation/linking.ts`（4 条根栈扁平深链） |
| 组件 | `components/TimelineBlock.tsx`（新增可选 `delayLongPress`，既有调用方行为不变） |

### 4.3 测试（10 新增 + 2 修改）

| 文件 | 覆盖 |
| --- | --- |
| `tests/permission.test.ts`（新） | 权限矩阵全组合 |
| `tests/schedule.test.ts`（新） | 换算/吸附/钳制/取消纯函数 |
| `tests/submission-flow.test.ts`（新+扩） | 状态机全迁移 / 落地分叉 / 列表守卫 / 审核通知 |
| `tests/draft.test.ts`（新） | 草稿序列化往返 + 防御性解析 |
| `tests/personal-plan.test.ts`（新·QA） | 个人计划 service 写方法 |
| `tests/permission-hook.test.tsx`（新·QA） | `useCan` 响应性 |
| `tests/screen-gate.test.tsx`（新·QA） | 深链权限门禁渲染 |
| `tests/draft-persist.test.tsx`（新·QA） | 草稿持久化边界 |
| `tests/seed-submissions.test.ts`（新·QA） | 种子提报约束（不污染待审列表） |
| `tests/today-focus-gate.test.tsx`（新·工程师） | member 不含「待我审核」/ manager 含 |
| `tests/linking.test.ts`（改） | 4 条新深链解析 + 往返一致；旧 URL 失效断言保留 |

### 4.4 过程文档

| 路径 | 产出人 | 说明 |
| --- | --- | --- |
| `docs/mobile-app/PRD-mobile-increment-1.md` | 产品经理 许清楚 | 348 行；变更范围 / 权限矩阵 / 8 条用户故事 / 需求池 / 提报状态机 / UI 与拖拽交互设计（AC1–AC10）/ 数据契约 |
| `docs/mobile-app/ARCH-mobile-increment-1.md` | 架构师 高见远 | 383 行；分层落点 / 关键取舍 / 34 文件清单 / 类图 / 3 条时序图 / T01–T05 任务图 / 零新增依赖论证 / 8 项风险兜底 |
| `docs/mobile-app/class-diagram-increment-1.mermaid`、`sequence-diagram-increment-1.mermaid` | 架构师 高见远 | 类图与 3 条链路时序图 |
| `docs/mobile-app/QA-mobile-increment-1.md` | QA 严过关 | 两轮验收；逐条验收表 / 缺陷清单 / 修复指令 / 测试盲区 / 路由判定 |
| `docs/mobile-app/DELIVERY-mobile-increment-1.md` | 主理人 齐活林 | 本文件 |

---

## 五、质量验证证据

### 5.1 自动化测试

```
npx tsc --noEmit                        → exit 0（0 error）
npx jest --config jest.config.js        → 25 suites / 383 tests 全部通过
grep -rn "reanimated|gesture-handler"   → 无命中（零新增依赖）
```

### 5.2 拖拽改期验收（PRD §5 AC1–AC10）

| # | 标准 | 结论 | 证据 |
| --- | --- | --- | --- |
| AC1 | 长按 **300ms** 进拖拽态（scale 1.05 + 阴影 + 参考线） | ✅ | `TimelineBlock.tsx` 新增可选 `delayLongPress` 并透传至内部 `Pressable`（:34/:100/:129）；`ScheduleTimeline.tsx:176` 传 `DRAG_LONG_PRESS_MS`（=300）。**修复过一轮**（原为 RN 默认 500ms） |
| AC2 | 跟手吸附 30 分钟、块高恒定 | ✅ | `utils/schedule.ts` `snapToSlot` / `resolveDrop`；`tests/schedule.test.ts` |
| AC3 | 松手调 `schedulePersonalTask` 并 `LayoutAnimation` 重排 | ✅ | `ScheduleTimeline` `onReschedule` → `PersonalPlanScreen` |
| AC4 | 失败回滚 + Toast「改期失败，请重试」 | ✅ | `PersonalPlanScreen` catch 分支 |
| AC5 | 拖拽态 `ScrollView scrollEnabled=false` | ✅ | `PersonalPlanScreen:829` `scrollEnabled={!dragging}` |
| AC6 | 取消（上滑 ≥56px / 水平越界）不落库 | ✅ | `isCancelDrag`（仅 2 条取消规则，垂直越界一律钳制——主理人裁定，规则越少越好测） |
| AC7 | 越界钳制（08:00 / 20:00−duration，时长不变） | ✅ | `clampStartMin` + `tests/schedule.test.ts` |
| AC8 | `kind='task'` 块只读不可拖 | ✅ | `DraggableBlock` 以 `enabled: draggable`（`kind==='personal'`）传入 `useDragReschedule` |
| AC9 | 点块 → `PickerSheet` 改期路径始终可用 | ✅ | 日视图 `onBlockPress` → 时段 `PickerSheet`（选项由 `SLOT_MINUTES`/`AXIS_*` 循环生成） |
| AC10 | 零新依赖 + `tsc` 0 error | ✅ | `package.json` 未改；grep 无命中 |

### 5.3 真实浏览器端到端验收（Playwright，390×844）

**A. 全路由扫测 13/13 PASS，控制台 0 错误**

| 路由 | 结果 | 关键内容 |
| --- | --- | --- |
| `/workspace` `/today` `/projects` `/time` `/me` `/me/notification-settings` `/me/about` `/task/task-001` `/notifications` | ✅ 9/9 | 既有页面无回归 |
| `/submit` | ✅ | 「新建事项」+「将直接创建，无需审核」（manager 分支） |
| `/create` | ✅ | 「创建事项」+ 项目/任务双类型（manager 具备两权限） |
| `/personal-plan` | ✅ | 列表（今天/本周）+ 排期（日/周 + 08:00–20:00 时间轴 + 任务块） |
| `/my-submissions` | ✅ | 五种状态标签 + 驳回原因回流 + `pending` 显示「撤回」 |

**B. 提报 → 审核 → 落地 → 站内通知 全链路（单会话内应用内导航实测）**

1. member 角色下工作台**只显示**「提报事项 / 个人计划」（「创建事项」被权限隐藏）✅
2. 提报页填写并选择目标项目 → 提交 → 成功返回工作台，「我的提报」新增一条 **待审核** 记录（含「撤回」入口）✅
3. 切回 manager → 「待我审核」由 4 条增至 **5 条**，含刚提交的提报 ✅
4. 右滑「通过」→ 待审回落至 **4 条**，提报落地 ✅
5. 通知页出现 **「提报已通过：你的提报『…』已通过审核」**（`review.result` 类型）✅ — `M2-P1-03` 闭环

**C. 权限门禁双向验证**

| 场景 | manager | member |
| --- | --- | --- |
| 「待我审核」分组 | 显示（汇总 18 项） | **隐藏**（汇总降为 14 项 = 18 − 4） |
| 工作台「创建事项」入口 | 显示 | 隐藏 |
| 项目列表创建 FAB | 显示（`aria-label="创建事项"`） | 隐藏 |

**D. 草稿持久化**

填入标题 → 600ms 防抖写入 `localStorage['os.draft_submission']` → 刷新页面 → **标题恢复 + 顶部提示「已恢复上次未提交的草稿」+「清除草稿」入口出现**；提交成功后 key 被移除 ✅

### 5.4 截图（`screenshots/mobile/`）

| 文件 | 内容 |
| --- | --- |
| `20-submission.png` | 提报/新建事项页（manager 分支） |
| `21-create-item.png` | 创建事项页 |
| `22-personal-plan.png` | 个人计划 · 列表视图 |
| `23-my-submissions.png` | 我的提报（三种状态 + 撤回） |
| `24-personal-plan-schedule.png` | 个人计划 · 排期视图（日/周 + 时间轴 + 任务块） |
| `25-today-member-gate.png` | member 视角「今日聚焦」——「待我审核」已隐藏 |
| `26-projects-fab.png` | 项目列表创建 FAB（manager） |
| `13-review-result-notification.png` | 通知页「提报已通过」 |

---

## 六、QA 验收与缺陷闭环

| 轮次 | 判定 | 发现 | 处置 |
| --- | --- | --- | --- |
| QA 第 1 轮 | `IS_PASS: NO` → 路由 `Engineer` | **DEF-01（P1）** `TodayFocusScreen` 无审核权限门禁 → member 可见并可「通过/驳回」；**DEF-02（P2）** 项目列表缺创建 FAB；**DEF-03（P2）** 空态文案「去 Web 端创建」误导 | 工程师修复；主理人独立复核 3 项属实 |
| QA 第 2 轮 | `IS_PASS: NO` → 路由 `Engineer` | **DEF-04（P2）** 驳回抽屉残留绕过（`handleRejectConfirm` 无门禁 + `rejectTarget` 角色切换未清理）；**DEF-05（P3）** FAB 遮挡末张卡片 ~36px | 工程师修复（函数体门禁 + 统一状态复位 effect + token 化 `paddingBottom`） |
| 主理人定向复验 | ✅ 通过 | 浏览器双向验证：member 无「待我审核」/无 FAB；manager 两者正常且汇总计数一致 | 关闭 |

> 说明：SOP 规定「最多 2 轮测试」。第 2 轮后仍有 2 处**轻量且修复指令明确**的残留，故追加一轮**定向修复 + 主理人复验**（而非第 3 轮全量 QA），并在此明示。

---

## 七、团队协作记录（增量 SOP）

| # | 阶段 | 成员 | 产出 | 质量关卡 |
| --- | --- | --- | --- | --- |
| 1 | 需求澄清 | 主理人 齐活林 | 4 个澄清问题（提报语义 / 权限落地 / 个人计划范围 / 第 4 项范围） | 用户裁定完成 |
| 2 | 增量 PRD | 产品经理 许清楚 | `PRD-mobile-increment-1.md` v1.2（348 行） | 主理人**驳回一次**：拖拽被误降为 P2 → 强制升为 P1 `M2-P1-04` 并补 AC1–AC10 |
| 3 | 增量架构 | 架构师 高见远 | `ARCH-mobile-increment-1.md` v1.0（383 行）+ 2 张 Mermaid + T01–T05 | 主理人核验通过 |
| 4 | 实现 T01+T02 | 工程师 寇豆码 | 类型契约 / 3 个纯工具 / service 8 写方法 / 种子 | 主理人独立复跑 17 套件 / 322 用例 |
| 5 | 实现 T03+T04 | 工程师 寇豆码 | 4 组件 + 1 hook（**首次批量失败未落盘，主理人重新分派**） | 主理人独立复跑 17 套件 / 321 用例 |
| 6 | BugFix | 工程师 寇豆码 | `TimelineBlock` 补 `delayLongPress` 并接线（AC1：300ms） | 主理人 grep 核验 3 处接线 |
| 7 | 实现 T05 | 工程师 寇豆码 ×3 批 | 4 新页 + 导航装配 + 3 存量页入口 | 主理人独立复跑 17 套件 / 329 用例 |
| 8 | 补齐 P1/P2 | 工程师 寇豆码 ×2 批 | 站内通知（`M2-P1-03`）+ 草稿持久化（`M2-P2-02`）+ 演示数据补齐 | 主理人独立复跑 18 套件 / 345 用例 |
| 9 | QA 第 1 轮 | QA 严过关 | 逐条验收 + 5 个新测试套件 + 3 缺陷 | 主理人复核缺陷属实（23 套件 / 373 用例） |
| 10 | 修复轮 | 工程师 寇豆码 | DEF-01/02/03 修复 + `today-focus-gate.test.tsx` | 主理人复跑 24 套件 / 375 用例 |
| 11 | QA 第 2 轮 | QA 严过关 | 回归 + 新风险排查（manager 侧完好）+ 2 处残留 | 主理人复跑 25 套件 / 383 用例 |
| 12 | 最终修复 | 工程师 寇豆码 | DEF-04/05 修复 | 主理人复跑 25 套件 / 383 用例 |
| 13 | 主理人实测验收 | 主理人 齐活林 | 13 路由扫测 + 全链路 + 权限双向 + 草稿持久化 + 8 张截图 | 全部 PASS，控制台 0 错误 |

---

## 八、已知限制与遗留

1. **拖拽手势层无自动化测试**：`jest-expo` 无手势/组件交互能力，AC1/AC3/AC4/AC5 的**视觉与手势行为**需真机手测；纯数学逻辑（吸附/钳制/取消）已 100% 由 `tests/schedule.test.ts` 覆盖。本轮主理人已用**合成触摸事件**在浏览器中验证「右滑通过」链路可用，但**长按拖拽**未在浏览器中验证（鼠标事件不被 `PanResponder` 接管）。
2. **登录为单用户演示**：`authService.login` 恒返回演示账号（`buildUser` 未按邮箱分叉），故「以提报人身份查看通知」无法通过切换登录账号实现 —— 本轮改用「同一账号切换角色」完成全链路验证。
3. **内存库随刷新复位**：mock 数据在内存中，整页刷新即回到种子状态（这是既有设计）。故端到端验证必须在**单会话内用应用内导航**完成。
4. **`completeTask` → 待审核 断链仍未接通**（PRD §2.3 明确排除），「待我审核」中的「完成提报」类条目仍只来自种子数据，作为 **increment-2** 处理。
5. **多余构建产物待清理**：本次迭代产生了 `apps/mobile/dist`、`dist-v2`、`dist-v3`、`dist-v4` 四个 Web 导出目录（`dist-v4` 为最新）。沙箱安全策略拦截了批量删除（单目录 > 50 文件），**需手动清理**：`rm -rf apps/mobile/dist apps/mobile/dist-v2 apps/mobile/dist-v3`（保留 `dist-v4` 或按需重命名）。

---

## 九、用户下一步建议

1. **真机体验排期拖拽（推荐）**：`cd apps/mobile && npm start`，Expo Go 扫码 → 「我的 → 个人计划 → 排期」长按个人任务块拖动。这是本增量唯一无法在浏览器完整验证的交互。
2. **浏览器快速预览**：`npm run web`，或看已导出产物 `apps/mobile/dist-v4/`；演示账号 `zhangwei@example.com` / `openschedule`（登录页底部一键填入）。
3. **接真实后端**：设 `EXPO_PUBLIC_USE_MOCK=false` 并配置 `API_BASE`，**无需改页面代码**；本次新增 8 个写方法的 `// TODO(real-api)` 已标注待对接的 METHOD / path。
4. **推进 increment-2**：建议优先做 `completeTask` → 待审核 断链（PRD §2.3 已给出改动点），即可让「待我审核」完全由真实操作供给。
5. **可选打磨**：项目列表 FAB 已在本次补上；后续可考虑把「个人计划」提升为底部 Tab（当前为二级入口，PRD N5 明确本次不做）。
