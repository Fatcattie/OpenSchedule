# QA 报告 — OpenSchedule 移动端 · 增量 1（提报 / 创建 / 个人计划 / 排期拖拽 / 待审详情入口）

> 报告人：严过关（QA） · 日期：**2026-09-27** · 基线：PRD `PRD-mobile-increment-1.md` **v1.2** / ARCH `ARCH-mobile-increment-1.md` **v1.0**
> 工作目录：`apps/mobile` · 职责边界：仅运行命令 / 读代码 / 写 `tests/**`，**未改动 `src/**` 任何源码**

---

## 1. 结论摘要

| 项 | 结果 |
| --- | --- |
| **IS_PASS** | **NO**（**第 2 轮复审结论**：DEF-01 部分关闭 + 新增 DEF-04 P2 / DEF-05 P3，见文末第 2 轮章节；第 1 轮原始为 1×P1 + 2×P2） |
| `npx tsc --noEmit` | **exit=0（0 error）** |
| `npx jest --config jest.config.js` | **23 suites / 373 tests 全绿**（工程师自报 18/345 + QA 新增 5 suites / 28 tests） |
| 回归红线（4 套件） | **67/67 全绿** |
| 零新增依赖 | **确认**（`grep -rn "reanimated\|gesture-handler" src/ package.json` → 无命中；`package.json` 未变） |
| 智能路由判定 | **Engineer**（源码有 Bug，需寇豆码修；逐条修复指令见 §6） |

**真实命令输出（节选）**
```
$ npx tsc --noEmit; echo "tsc exit=$?"
tsc exit=0

$ npx jest --config jest.config.js 2>&1 | tail -5
Test Suites: 23 passed, 23 total
Tests:       373 passed, 373 total

$ npx jest --config jest.config.js tests/services.test.ts tests/round2-regression.test.ts tests/seed-integrity.test.ts tests/mention.test.ts 2>&1 | tail -5
Test Suites: 4 passed, 4 total
Tests:       67 passed, 67 total

$ grep -rn "reanimated\|gesture-handler" src/ package.json || echo "OK 无禁用依赖"
OK 无禁用依赖

$ grep -n "delayLongPress" src/components/TimelineBlock.tsx src/components/ScheduleTimeline.tsx
src/components/TimelineBlock.tsx:34:  delayLongPress?: number
src/components/TimelineBlock.tsx:100:  delayLongPress,
src/components/TimelineBlock.tsx:129:        delayLongPress={delayLongPress}
src/components/ScheduleTimeline.tsx:176:        delayLongPress={DRAG_LONG_PRESS_MS}
```

> ⚠️ **独立复核结论**：工程师自报的 `tsc` / 测试数 / 零依赖**全部属实**。但「全绿」不等于「全部验收标准达成」——本次发现 1 项 P1 权限门禁缺陷（member 仍可见并可操作「待我审核」）**未被任何测试捕获**，故 `IS_PASS=NO`。

---

## 2. 逐条验收表（PRD §5）

| 编号 | 结论 | 证据（文件:行号 / 命令） |
| --- | --- | --- |
| **M2-P0-01** 权限工具 | **部分通过** | `can('task:create')` member→false：`src/utils/permission.ts:33,54-58`（`tests/permission.test.ts` 全组合）；member 创建入口隐藏：`src/screens/WorkspaceScreen.tsx:95-102`；`tsc` 0 error。<br>❌ **审核入口未隐藏**：`src/screens/TodayFocusScreen.tsx` 全文无 `useCan`，`TAB_OPTIONS`（:53-57）恒含 `review`，`SegmentedControl` 直接渲染（:339），`buildActions`（:284-306）对 review 分组无条件返回通过/驳回 → member 可见**且可操作**审核。见 **DEF-01** |
| **M2-P0-02** PickerSheet | **通过** | 承载优先级/项目/负责人：`src/components/ItemForm.tsx:305-330`；日期/时间：`src/components/DateTimeField.tsx:64-70,191-208`；无新增依赖（§1 grep）；样式全取 token：`src/components/PickerSheet.tsx:120-163`（`colors`/`spacing`/`radius`/`layout`/`typography`，无内联魔法数字） |
| **M2-P0-03** 提报→pending | **通过** | `src/services/task.service.ts:813-838`（`buildSubmissionRecord` :722-765：`submissionStatus='pending'`、`reviewerIds=allManagerIds()`）；`reviewerIds` 非空含全部 manager + 返回后列表可见：`tests/submission-flow.test.ts:84-113`；返回刷新：`src/screens/SubmissionScreen.tsx:207`（`goBack()` → 来源页 `refetch`） |
| **M2-P0-04** 创建→落地 | **通过（入口缺一处，见 DEF-02）** | `createTask`：`src/services/task.service.ts:694-703`（`insertTask` :651-691，`source='published'`、`createdBy=actorId`）；`createProject`：`src/services/project.service.ts:167-174`；列表/看板可查：`tests/submission-flow.test.ts:134-175` |
| **M2-P0-05** 审核与落地 | **通过** | approve→落地正式事项（`source='published'`）：`task.service.ts:918-930` + `landSubmissionRecord` :774-806；reject→`reviewNote` 必填≥4：`task.service.ts:933-939`（`isValidReviewReason`，`utils/submission.ts:97-99`）；原因回流：`src/screens/MySubmissionsScreen.tsx:159-163`；`tests/submission-flow.test.ts:183-237` |
| **M2-P0-06** 个人计划页 | **通过** | `listPersonalTasks` 被页面调用：`src/screens/PersonalPlanScreen.tsx:279`；CRUD 后 `refetch` 即时更新：:505,:531,:553；三态齐全（loading/error/empty）：:634-653；**新增 `tests/personal-plan.test.ts`（14 用例）补齐 service 层覆盖** |
| **M2-P0-07** 待审「查看详情」 | **通过** | 仅 `tab==='review'` 注入：`src/screens/TodayFocusScreen.tsx:430-442`；点击 `openTask`（:276-281，`from='today'`）；`due`/`approaching` 分支 `right=undefined`（同一三元表达式保证） |
| **M2-P1-01** 排期视图（点块改期） | **通过** | 点块→PickerSheet→`schedulePersonalTask`：`PersonalPlanScreen.tsx:562-575,986-993`；落库：`focus.service.ts:372-388`；改后即时重排：`PersonalPlanScreen.tsx:552-553`（`runLayoutAnimation` + `refetch`）；新增 `tests/personal-plan.test.ts` 覆盖落库 |
| **M2-P1-02** 我的提报（状态+撤回） | **通过** | 四态：`MySubmissionsScreen.tsx:34-40`；pending 可撤回：:134,142-144（`withdrawSubmission` `task.service.ts:854-879`）；驳回原因展示：:159-163 |
| **M2-P1-03** 审核结果通知 | **通过** | 写入 `review.result`：`task.service.ts:911-917`（通过）/`:942-948`（驳回，正文含原因）；断言：`tests/submission-flow.test.ts:334-372` |
| **M2-P1-04** 拖拽改期 | **见 AC1–AC10** | §3 |
| **M2-P2-02** 草稿持久化 | **通过** | 纯函数 `src/utils/draft.ts`（序列化/防御式反序列化）；页面读写 `SubmissionScreen.tsx:120-155,102-117`；**新增 `tests/draft-persist.test.tsx`（3 用例）组件级验证恢复 / 路由 kind 优先 / 读取抛错静默降级** |

---

## 3. 拖拽改期 AC1–AC10 逐条核对

| AC | 结论 | 证据 |
| --- | --- | --- |
| **AC1** 长按 300ms 进入拖拽态 | **通过（静态复核；手势行为见 §5 盲区）** | `delayLongPress={DRAG_LONG_PRESS_MS}`（=300，`utils/schedule.ts:13`）**真正透传**到内部 `Pressable`：`ScheduleTimeline.tsx:176` → `TimelineBlock.tsx:129`（**未回退**，修复保持）；`scale→1.05`：`hooks/useDragReschedule.ts:51,119-123`；阴影加重：`ScheduleTimeline.tsx:333-336`（`shadow.floating`）；对齐参考线：`ScheduleTimeline.tsx:278-280`；长按期间不触发点击：RN `Pressable` 在 `onLongPress` 后抑制 `onPress`（`TimelineBlock.tsx:124-129`）。<br>✅ **CalendarScreen 未传该 prop**：`src/screens/CalendarScreen.tsx:373-385` 只传 `onPress` → 既有行为不变 |
| **AC2** 30min 吸附 + 块高恒定 | **通过** | `snapToSlot`（30min）：`utils/schedule.ts:42-44`；时长恒定（`endMin=startMin+duration`）：`resolveDrop` :70-74；`tests/schedule.test.ts:49-133` |
| **AC3** 松手落库 + LayoutAnimation | **通过** | `onPanResponderRelease`→`onDrop`→`schedulePersonalTask`：`useDragReschedule.ts:142-155`、`PersonalPlanScreen.tsx:545-560`；成功后 `runLayoutAnimation`：:552 |
| **AC4** 失败回滚 + Toast | **通过** | `catch → showToast('改期失败，请重试') + refetch`：`PersonalPlanScreen.tsx:554-557`（回滚由 `refetch` 复位；`translateY` 已在 release 时归零，:153） |
| **AC5** 拖拽态 ScrollView 禁用 | **通过** | `scrollEnabled={!dragging}`：`PersonalPlanScreen.tsx:829`；`onDragStateChange`：:542,724 |
| **AC6** 取消（上滑 / 水平越界）不落库 | **部分通过** | 上滑 ≥56px 取消：`utils/schedule.ts:102`；水平越界取消：:104-105。⚠️ `timelineWidthPx` 取**容器全宽**（含时间刻度列，`ScheduleTimeline.tsx:197-199` 测 `styles.container`），实际手指几乎不可能拖出全宽 → 该分支近乎不可达；垂直越界**走 AC7 钳制**（符合 ARCH §9 R6 裁定）。上滑取消可用，判定阈值偏大 |
| **AC7** 越界钳制（时长不变） | **通过** | `clampStartMin`：`utils/schedule.ts:52-56`（<08:00→480；>1200−dur→1200−dur；dur≥720→480）；`tests/schedule.test.ts:72-99,118-132` |
| **AC8** `kind='task'` 只读 | **通过** | `enabled: draggable`（`ScheduleTimeline.tsx:113,128`）→ `beginDrag` 早退（`useDragReschedule.ts:116`）；`onLongPress={draggable ? beginDrag : undefined}`（`ScheduleTimeline.tsx:175`）；点击进详情：`PersonalPlanScreen.tsx:567-569` |
| **AC9** 点块改期路径始终可用 | **通过** | `PersonalPlanScreen.tsx:562-575`（点个人块→`setSlotTask`）+ `:986-993`（PickerSheet→`handleSlotSelect`） |
| **AC10** 零新依赖 + tsc 0 | **通过** | §1 grep（无 `reanimated`/`gesture-handler`）；仅用 `Animated`/`PanResponder`/`LayoutAnimation`（`useDragReschedule.ts:14`、`ScheduleTimeline.tsx:10`）；`tsc` 0 error |

---

## 4. 回归红线结果（C 节）

| # | 项 | 结论 | 证据 |
| --- | --- | --- | --- |
| C-1 | `tests/services.test.ts`（`reviewSubmission` 既有分支不变） | **通过** | `task-014` approve→`status='done'`、`task-015` reject→`status='in_progress'` 保持：`tests/services.test.ts:168-183`；`tests/submission-flow.test.ts:266-283`。4 套件 67/67 全绿 |
| C-2 | `round2-regression` / `seed-integrity` / `mention` | **通过** | 同上命令输出（67 用例含） |
| C-3 | 列表守卫（`submissionKind='task'` pending 记录） | **通过** | `tests/submission-flow.test.ts:285-322`：`listTodayDue`/`listDeadlineApproaching`/`listMyTodos`/`listTasksByProject`/`listBoardColumns`/`listScheduledTasks`/`getCalendarDay` **均不含**该记录，`listPendingReview` **含**。守卫实现：`task.service.ts:147,166,199,215,966`、`project.service.ts:36,109`、`focus.service.ts:456` |
| C-4 | seed `task-022`(rejected)/`task-023`(approved) | **通过** | `src/data/seed.ts:607-656`：`createdBy=DEMO_USER_IDS.me`、`status='cancelled'`（**非 `pending`**）。**新增 `tests/seed-submissions.test.ts`（4 用例）独立断言**（含「不污染待审列表」「出现在我的提报」） |

---

## 5. 缺陷清单

| 编号 | 严重级 | 现象 | 复现 | 期望 | 证据（文件:行号） | 责任归属 |
| --- | --- | --- | --- | --- | --- | --- |
| **DEF-01** | **P1 严重** | **member 角色可见并可操作「待我审核」**（权限绕过）：`TodayFocusScreen` 未接入 `review:view_pending` 门禁，review 分组对任意角色恒显示；切到 member 后仍能通过/驳回提报 | 1) 进入「今日聚焦」→ 切角色为「普通成员」；2) 顶部仍显示「待我审核」分组（badge>0，因演示账号 user-001 在 `reviewerIds` 中）；3) 卡片右滑出现「通过 / 驳回」并可成功提交 | 无 `review:view_pending` 权限时**隐藏**该分组、默认落在「今日到期」，且不可触发通过/驳回（PRD §3 / M2-P0-01） | `src/screens/TodayFocusScreen.tsx:53-57`（静态 TAB_OPTIONS）、`:339`（无条件渲染）、`:284-306`（`buildActions` 无角色门禁）；全文件无 `useCan`（`grep` 佐证）；`review:view_pending`/`submission:review` 在 `src/` 中**零引用**（`grep -rn "review:view_pending" src/` 仅命中 `utils/permission.ts`） | **Engineer** |
| **DEF-02** | **P2 一般** | 缺少 PRD §7.1 要求的「项目列表 FAB」创建入口 | 进入「项目看板」列表页 → 无任何创建入口 | 列表页提供 FAB（`can('project:create')`/`can('task:create')` 门禁）→ `navigate('CreateItem')`（PRD §7.1「入口：工作台快捷入口、**项目列表 FAB**」） | `src/screens/ProjectListScreen.tsx` 全文无 FAB / 无 `CreateItem` 跳转（:44-107） | **Engineer** |
| **DEF-03** | **P2 一般** | 项目列表空态文案与新增移动端创建能力不符（误导） | 项目列表空态 | 文案应引导移动端创建（而非「去 Web 端创建」） | `src/screens/ProjectListScreen.tsx:85`（"去 Web 端创建第一个项目，移动端会同步展示"） | **Engineer** |

### 观察项（**非缺陷**，已判定「通过」）
- **OBS-1** `SubmissionScreen` 无权限分支对 `manager`/`member` **均不可达**（两角色都具备 `submission:create`）→ §7.1「`/submit` 无权限深链→ErrorState」实际为空条件。属防御性代码，无缺陷；已由 `tests/screen-gate.test.tsx` 断言两角色均渲染表单。
- **OBS-2** `isCancelDrag` 的 `origStartMin`/`durationMin` 被 `void`（`utils/schedule.ts:99-100`）：**有意保留 ARCH §3 签名**，取消规则为上滑/水平越界，垂直越界由 `clampStartMin` 钳制（符合 ARCH §9 R6），**无规则缺失**。
- **OBS-3** `durationMin = Math.max(SLOT_MINUTES, …)`（`ScheduleTimeline.tsx:247-250`）：理论会把 <30min 任务撑为 30min；但 UI 时间网格为 30min 且 `start<end` 校验（`PersonalPlanScreen.tsx:477`）保证最小 30min，种子亦无 <30min 个人任务 → **实际不触发**，与 AC2「块高恒定」不冲突。
- **OBS-4** `PickerSheet` 泛型 `value: T | null` + `onSelect(value: T)`：清除路径为 `onClear?: () => void`（不传值），**类型安全**（`PickerSheet.tsx:24-29,103-115`）。
- **OBS-5** `ItemForm` 切换 `kind` 正确清空另一分支专属字段（`task`→清 `ownerId`，`project`→清 `projectId`）：`ItemForm.tsx:176-185`。**通过**。

---

## 6. 智能路由判定

**路由：Engineer**（源码有 Bug，需寇豆码修复）。修复后建议进入第 2 轮回归。

### DEF-01 修复指令（可直接施工）
**文件**：`src/screens/TodayFocusScreen.tsx`
1. 顶部引入：`import { useCan } from '@/utils/permission'`；
2. 组件内取权限：`const can = useCan()`；`const canReview = can('review:view_pending')`；
3. 过滤分组选项（把 `:110-117` 的 `tabOptions` 计算改为按权限过滤）：
   ```ts
   const tabOptions = useMemo(
     () =>
       TAB_OPTIONS
         .filter((option) => option.value !== 'review' || canReview)
         .map((option) => ({ ...option, badge: counts[option.value] })),
     [canReview, counts],
   )
   ```
4. 无权限时强制落在「今日到期」（新增 effect，防止残留 tab 状态）：
   ```ts
   useEffect(() => {
     if (!canReview && tab === 'review') setTab('due')
   }, [canReview, tab])
   ```
5. 防御性：`buildActions`（`:284-306`）的 `review` 分支加前置 `if (!canReview) return []`（或在 `tab === 'review' && canReview` 时返回审批动作）。
6. **补测**：建议在 `tests/screen-gate.test.tsx` 追加「member 渲染今日聚焦不含『待我审核』」用例（需 mock `focusService.getTodayFocus`）。

### DEF-02 修复指令
**文件**：`src/screens/ProjectListScreen.tsx`
1. 引入 `useCan`（`@/utils/permission`）；`const can = useCan()`；
2. 在 `ScrollView` 同级（`<View style={styles.root}>` 内）按 `can('project:create') || can('task:create')` 条件渲染 FAB（`Pressable`，样式可复用 `PersonalPlanScreen.tsx:1164-1174` 的 `fab`），`onPress={() => navigation.navigate('CreateItem')}`。

### DEF-03 修复指令
**文件**：`src/screens/ProjectListScreen.tsx:82-86`：将空态 `description` 由「去 Web 端创建第一个项目，移动端会同步展示」改为引导移动端创建（如「点击右下角 + 创建你的第一个项目」）。

---

## 7. 测试覆盖盲区（无法自动化验证）

| 盲区 | 理由 |
| --- | --- |
| **拖拽手势层**（`useDragReschedule` 的 `PanResponder` 装配、长按接管、`Animated` 视觉：scale 1.05 / 阴影 / 参考线 / 回滚动画） | `jest-expo` 无组件交互/手势能力（ARCH §8 已声明）；AC1/AC3/AC4/AC5 的**视觉与手势行为**需**真机/模拟器手测**。纯数学逻辑（吸附/钳制/取消）已由 `tests/schedule.test.ts` 覆盖 |
| **长按期间不触发点击**（RN `Pressable` 内部行为） | 依赖 RN 原生手势状态机，测试环境无法模拟长按+抬起序列 |
| **真实深链跳转**（`NavigationContainer` + `linking.prefixes` 端到端） | 仅验证了 `getStateFromPath`/`getPathFromState` 往返（`tests/linking.test.ts`），未起真实导航容器 |
| **组件视觉快照**（阴影/参考线/描边） | 未引入快照测试（ARCH 未要求）；样式 token 一致性靠代码审查 |
| **`WorkspaceScreen` 角色切换后入口即时刷新（真机）** | 已用 `tests/permission-hook.test.tsx` 覆盖 `useCan` 响应性（等价行为），但整页重渲染的真机表现未测 |

> **QA 新增测试（5 套件 / 28 用例，均真实通过）**：`tests/personal-plan.test.ts`（14）、`tests/permission-hook.test.tsx`（3）、`tests/screen-gate.test.tsx`（4）、`tests/draft-persist.test.tsx`（3）、`tests/seed-submissions.test.ts`（4）。这些用例分别补齐了：个人计划 service 写方法、`useCan` 响应性、深链权限门禁渲染、草稿持久化边界、种子提报约束。

---

## 8. 报告信息

- **报告日期**：2026-09-27
- **基线版本**：PRD `PRD-mobile-increment-1.md` **v1.2** / ARCH `ARCH-mobile-increment-1.md` **v1.0**
- **测试环境**：Node + `jest-expo` preset（`jest.config.js`），`USE_MOCK=true`（内存 mock 库）
- **QA 结论**：**IS_PASS=NO** → 路由 **Engineer**（修复 DEF-01 后可复审；DEF-02/03 为 P2，可与 DEF-01 一并修复）

---

## 第 2 轮回归验证（2026-09-27）

> 验证对象：工程师寇豆码对 **DEF-01 / DEF-02 / DEF-03** 的修复（自报 `tsc` 0 error / 24 suites / 375 tests）。
> QA 独立复核：**未采信自报**，重跑命令 + 逐行读源码 + 补测（增强/新增 2 个测试文件）。
> 职责边界：仅运行命令 / 读源码 / 写 `tests/**`，**未改动 `src/**`**。

### 1. 结论摘要

| 项 | 结果 |
| --- | --- |
| **IS_PASS** | **NO**（DEF-01 **部分关闭**：残留 1 条 P2 绕过路径 **DEF-04**；另发现 1 项 P3 布局缺陷 **DEF-05**） |
| `npx tsc --noEmit` | **exit=0（0 error）** |
| `npx jest --config jest.config.js` | **25 suites / 383 tests 全绿**（≥375 达标；含 QA 第 2 轮 +4 增强用例 + 4 新增用例） |
| 回归红线（4 套件） | **67/67 全绿** |
| 零新增依赖 | **确认**（`package.json` 未变，无 `reanimated`/`gesture-handler`） |
| 智能路由判定 | **Engineer**（DEF-04 为源码残留门禁缺口，需寇豆码修；DEF-05 建议同批） |

**真实命令输出**
```
$ npx tsc --noEmit; echo "tsc exit=$?"
tsc exit=0

$ npx jest --config jest.config.js 2>&1 | tail -6
Test Suites: 25 passed, 25 total
Tests:       383 passed, 383 total
Snapshots:   0 total
Time:        51.555 s
Ran all test suites.

$ npx jest --config jest.config.js tests/services.test.ts tests/round2-regression.test.ts tests/seed-integrity.test.ts tests/mention.test.ts 2>&1 | tail -6
Test Suites: 4 passed, 4 total
Tests:       67 passed, 67 total

$ grep -rn "reanimated\|gesture-handler" src/ package.json || echo "OK 无禁用依赖"
OK 无禁用依赖

$ grep -rn "reviewSubmission" src/ --include=*.tsx
src/screens/TodayFocusScreen.tsx:216:        await taskService.reviewSubmission(task.id, 'approve', task.version)
src/screens/TodayFocusScreen.tsx:266:      await taskService.reviewSubmission(target.id, 'reject', target.version, rejectReason.trim())
```

> **复核要点**：工程师自报的 `tsc` / 测试数 / 零依赖**全部属实**，且 24→25 套件、375→383 用例的增量均由 QA 本轮补测贡献（工程师仅新增 `today-focus-gate.test.tsx` 的 2 用例）。但「全绿」仍不等于「缺陷全关」——DEF-01 存在**未被任何测试覆盖**的残留绕过路径（DEF-04），故 `IS_PASS=NO`。

### 2. 缺陷关闭状态表

| 缺陷 | 状态 | 证据（`文件:行号` / 命令） |
| --- | --- | --- |
| **DEF-01**（P1 权限绕过） | **部分关闭** | ✅ **主路径已关闭**：① `useCan` 接入 `src/screens/TodayFocusScreen.tsx:34,73-75`；② `tabOptions` 按 `canReview` 过滤 review 分组 `:114-124`（覆盖 `SegmentedControl` 的 `options`，即唯一渲染入口）；③ 兜底 effect `:127-129`（`deps=[canReview, tab]`，角色切换后即时回落 `due`）；④ `buildActions` 前置门禁 `:299-304`（`if (!canReview) return []`）；⑤「查看详情」入口同步门禁 `:452`；⑥ AI 提议区块仅 `tab==='review'` 渲染 `:361`；⑦ 头部汇总 `visibleTotal` 排除 review `:132`。<br>✅ 上述均**实测通过**（`tests/today-focus-gate.test.tsx` 6 用例全绿，含切角色残留防护）。<br>❌ **残留绕过路径未闭合** → 见 **DEF-04**：驳回抽屉的确认动作（`handleRejectConfirm`）**无 `canReview` 门禁**，且 `rejectTarget` 未在角色变更时清理 → member 仍存在 1 条可达 `reviewSubmission('reject')` 路径。 |
| **DEF-02**（P2 缺入口） | **已关闭** | FAB 按 `canCreate = can('project:create') || can('task:create')` 门禁渲染：`src/screens/ProjectListScreen.tsx:31-33,113-123`（manager 显示 / member 隐藏）；`accessibilityLabel="创建事项"` `:117`；`onPress={() => navigation.navigate('CreateItem')}` `:118`；路由已注册 `src/navigation/stacks.tsx:127`。**实测**：`tests/project-list-fab.test.tsx`（manager 渲染 FAB 且点击 `navigate('CreateItem')`；member 不渲染）全绿。 |
| **DEF-03**（P2 文案） | **已关闭** | 空态文案按 `canCreate` 分叉：`src/screens/ProjectListScreen.tsx:87-93`（manager→「点击右下角 + 创建你的第一个项目」；member→「去 Web 端创建第一个项目，移动端会同步展示」）。**实测**：`tests/project-list-fab.test.tsx`（两角色文案各自匹配、互斥断言）全绿。 |

### 3. 回归结果（B 节 6 项逐条）

| # | 项 | 结论 | 证据 |
| --- | --- | --- | --- |
| B-1 | `tsc` 0 error + 全量 jest 全绿且用例数 ≥375 | **通过** | `tsc exit=0`；**25 suites / 383 tests**（≥375）全绿 |
| B-2 | 回归红线 4 套件 + `reviewSubmission` 既有分支不变 | **通过** | 4 套件 **67/67** 全绿；`task-014` approve→`status='done'`、`task-015` reject→`status='in_progress'` 保持：`tests/services.test.ts:169-182` |
| B-3 | 第 1 轮新增 5 测试仍全绿 | **通过** | `personal-plan.test.ts` / `permission-hook.test.tsx` / `screen-gate.test.tsx` / `draft-persist.test.tsx` / `seed-submissions.test.ts` 均在 25 套件内全绿 |
| B-4 | 列表守卫（提报记录不进正式列表）仍生效 | **通过** | `tests/submission-flow.test.ts:285-322`（7 处列表 `listTodayDue`/`listDeadlineApproaching`/`listMyTodos`/`listTasksByProject`/`listBoardColumns`/`listScheduledTasks`/`getCalendarDay` 均不含，`listPendingReview` 含）全绿 |
| B-5 | AC1：`delayLongPress` 透传 + `CalendarScreen` 未传 | **通过** | `ScheduleTimeline.tsx:176` → `TimelineBlock.tsx:129`（`DRAG_LONG_PRESS_MS=300`，`utils/schedule.ts:13`）；`CalendarScreen.tsx` 未命中该 prop（grep 无输出）→ 行为不变 |
| B-6 | 零新增依赖 | **通过** | `grep` 无 `reanimated`/`gesture-handler`；`package.json` 依赖表未变（无新增条目） |

### 4. C 节新风险排查结论（5 项逐条）

| # | 项 | 结论 | 证据 |
| --- | --- | --- | --- |
| C-1 | **manager 侧「待我审核」分组 / badge / 右滑「通过/驳回」功能完好** | **✅ 完好（最关键项，已补测）** | `tests/today-focus-gate.test.tsx`「manager 审批能力回归」用例：manager 切到 `review` 分组后，`SwipeableRow.props.actions` 含 `approve`+`reject`，且「查看详情」入口渲染、任务可见。加门禁**未误伤 manager** |
| C-2 | `visibleTotal` 改动后 manager「N 项待处理」= 三分组之和 | **✅ 一致** | 代码 `:132`：`counts.due + counts.approaching + (canReview ? counts.review : 0)`。实测：manager（pendingReview=1）→「共 1 项待处理」；member 同数据 →「共 0 项待处理」（review 不计入） |
| C-3 | FAB 是否遮挡列表底部（`paddingBottom` 是否足够） | **❌ 遮挡** → **DEF-05** | `ProjectListScreen.tsx:54` `paddingBottom: spacing.xxxl`(=40) < FAB 高 `spacing.xxxl+spacing.md`(=56) + `bottom` `spacing.lg`(=20) = **76** → 滚到底时 FAB 与最后一张卡片右下角重叠 **~36px**（含安全区更大） |
| C-4 | `useMemo`/`useEffect` 依赖遗漏导致门禁滞后 | **✅ 无遗漏** | `tabOptions` deps `[canReview, counts]`、`buildActions` deps 含 `canReview`、`currentTasks` deps `[focus.data, tab]`、兜底 effect deps `[canReview, tab]`；角色切换后入口**即时刷新**（切角色残留防护用例验证）。附 1 项低危观察（见下） |
| C-5 | 新增 `today-focus-gate.test.tsx` 断言是否真实有效 | **✅ 原断言有效但偏弱，已增强** | 原 2 用例（member 不含「待我审核」/ manager 含）**非永真**：若移除 `tabOptions` 过滤，member 会渲染「待我审核」→ 断言失败（能抓回归）。但**未覆盖** buildActions 门禁 / 残留状态 / manager 侧 → 本轮增强为 **6 用例** |

> **C-4 附观察（低危，非缺陷）**：角色 `manager→member` 时若 `tab` 仍为 `review`，**首帧**（effect 执行前）仍会渲染 `pendingReview` 列表（只读：无审批动作、无「查看详情」），次帧由兜底 effect 回落 `due`。即任务标题瞬时可见 1 帧、无能力泄露；真机不可感知。建议后续可将 `currentTasks` 亦按 `canReview` 短路（`if (tab==='review' && !canReview) return []`）以消除瞬态。

### 5. 新缺陷（第 2 轮发现）

| 编号 | 严重级 | 现象 | 复现 | 期望 | 证据（`文件:行号`） | 责任归属 |
| --- | --- | --- | --- | --- | --- | --- |
| **DEF-04** | **P2 一般** | **驳回抽屉残留绕过路径**：`handleRejectConfirm` 无 `canReview` 门禁，`rejectTarget` 未在角色切换时清理 → member 仍可触发 `reviewSubmission('reject')` | 1) manager 进「今日聚焦」→「待我审核」→ 右滑卡片 → 点「驳回」（抽屉打开，`rejectTarget` 置位）；2) 不关抽屉，切到「工作台」Tab → 切角色为「普通成员」；3) 切回「今日聚焦」Tab（页面未卸载，抽屉仍可见）；4) 输入 ≥2 字 → 点「确认驳回」→ **以 member 身份执行审核驳回** | 无 `review:view_pending` 权限时**任何**审批动作（含抽屉确认）均不可达 | `TodayFocusScreen.tsx:261-273`（`handleRejectConfirm` 无门禁）、`:495`（抽屉 `visible` 仅依赖 `rejectTarget`）、`:518`（确认按钮 `onPress` 无门禁）；角色切换仅 `WorkspaceScreen.tsx:266`/`ProfileScreen.tsx:63`（其他 Tab，`MainTabs.tsx` 底部 Tab 默认**不卸载**已挂载页面）；全文无 `useFocusEffect`/清理 effect | **Engineer** |
| **DEF-05** | **P3 轻微** | 项目列表 FAB **遮挡最后一张卡片右下角**（`paddingBottom` 不足） | 项目列表滚动到底部 | 列表底部预留 ≥ FAB 高 + `bottom` 的留白，FAB 不遮挡内容 | `ProjectListScreen.tsx:54`（`paddingBottom: spacing.xxxl`=40）、`:113-123`（FAB 高 56 + `bottom` 20）；对比 `TodayFocusScreen.tsx:334` 用 `spacing.xxxl * 2` | **Engineer** |

**修复建议（供工程师，QA 未改动 `src/**`）**
- **DEF-04**：在兜底 effect 同步清理抽屉，或对确认动作加前置门禁（任一即可）：
  ```ts
  // 方案 A（推荐）：角色失权时同步关闭抽屉
  useEffect(() => {
    if (!canReview && rejectTarget) {
      setRejectTarget(null)
      setRejectReason('')
    }
  }, [canReview, rejectTarget])
  // 方案 B：handleRejectConfirm 前置 `if (!canReview) return`
  // 方案 C：抽屉渲染处 `{canReview ? <BottomSheet ... /> : null}`
  ```
- **DEF-05**：`ProjectListScreen.tsx:54` 的 `paddingBottom` 改为 `spacing.xxxl * 2`（=80）。

### 6. 智能路由判定

**路由：Engineer**（DEF-04 为源码残留门禁缺口，须由寇豆码修复；DEF-05 建议同批修复）。
> 说明：本轮**未发现测试代码缺陷**（QA 自测用例已全部真实通过）；失败项均归因源码。

### 7. QA 第 2 轮测试变更（`tests/**`，未触碰 `src/**`）

| 文件 | 变更 | 用例数 |
| --- | --- | --- |
| `tests/today-focus-gate.test.tsx` | **增强**（2 → 6）：新增「manager 审批能力回归」「切角色残留防护」「member 带数据不泄露 + 计数排除 review」「member 强制 review 防御」；断言由纯文本升级为 `SwipeableRow.props.actions` + 递归文本拼接（规避隐藏抽屉误判 / 数字子节点拆分） | 6 |
| `tests/project-list-fab.test.tsx` | **新增**：DEF-02 FAB 门禁（manager 显示+跳转 `CreateItem` / member 隐藏）+ DEF-03 空态文案分叉 | 4 |
| `tests/react-test-renderer.d.ts` | **扩展**：类型兜底补 `root` / `ReactTestInstance` / `findAll(ByType)`（测试基础设施，非业务代码） | — |

> 测试总量：**375 → 383**（+8）。全绿。

### 8. 报告信息（第 2 轮）

- **报告日期**：2026-09-27
- **基线版本**：PRD `PRD-mobile-increment-1.md` **v1.2** / ARCH `ARCH-mobile-increment-1.md` **v1.0**
- **测试环境**：Node + `jest-expo` preset（`jest.config.js`），`USE_MOCK=true`（内存 mock 库）
- **QA 结论**：**IS_PASS=NO** → 路由 **Engineer**（修复 **DEF-04** 后可复审；**DEF-05** 建议同批）
