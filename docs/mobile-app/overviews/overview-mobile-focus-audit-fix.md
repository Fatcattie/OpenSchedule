# 交付概览：今日聚焦「审核功能看不到」修复

> 团队 `software-mobile-focus-audit` · 项目 `apps/mobile`（Expo SDK 57 / RN 0.86）
> 日期：2026-10-05

## TL;DR

用户第二次投诉「APP 里没有审核功能（通过、不通过、退回）」。核查确认为**今日聚焦页的审批按钮藏在右滑动作层里、默认不可见**。已改为**卡片下方默认展示三枚审批按钮**，并在真实运行的应用中验证生效。

## 问题与根因

| 项 | 内容 |
| --- | --- |
| 现象 | 今日聚焦 → 待我审核，卡片右侧只有「查看详情」，看不到审批按钮 |
| 根因 | 三枚审批按钮只存在于 `SwipeableRow` 的**右滑动作层**（宽 76），被卡片盖住；需右滑才露出，**不可发现** |
| 对比 | 审核中心 `/audit-center` 的三按钮**默认可见**（x≈285–310）且点击有效 —— 两页行为不一致 |
| 附带缺陷 | 控制台 `<button>` 嵌套报错（`TaskCard` 整卡 `Pressable` + 插槽在其内部） |

## 改动清单（4 文件，零新增依赖）

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `src/utils/audit.ts` | 修改 | 新增审核域**共用文案常量**：`REVIEW_ACTION_LABEL`（通过/不通过/退回重改）、`REVIEW_ACTION_A11Y`（审核通过/审核不通过/审核退回重改）—— 单一事实来源 |
| `src/screens/AuditCenterScreen.tsx` | 修改 | 删除本地重复的 6 个文案常量，改为从共用常量解构别名（**值/行为零变更**） |
| `src/screens/TodayFocusScreen.tsx` | 修改 | `openRejectDrawer(task, opinion)` 共用入口；`isReviewTab = tab === 'review' && canReview` 统一门禁；三枚 `PressableScale` **默认可见**（渲染在 `SwipeableRow` **之外**）；「查看详情」改非交互 `Text` + chevron |
| `tests/today-focus-review-actions.test.tsx` | 新增 | 7 例（RA-1..RA-7） |

### 关键设计

- **位置**：三枚按钮渲染在 `FadeIn` 下、`SwipeableRow` **之外** ⇒ 既非右滑层、也不在 `Card` 的 `Pressable` 内部 ⇒ **不产生 `<button>` 嵌套**。
- **门禁**：`isReviewTab = tab === 'review' && canReview` —— 无审核权限时**完全不渲染**（隐藏而非置灰）。
- **三路分支**（语义对齐审核中心）：
  - `通过` → `handleApprove(task)` = `approve + agree`
  - `不通过` → `openRejectDrawer(task,'reject')` = `reject + reject`
  - `退回重改` → `openRejectDrawer(task,'rework')` = `reject + rework`
- **兼容**：右滑快捷动作**保留**，与内联按钮共用 `openRejectDrawer`，行为零分叉。

## 验证结果

### 主理人独立复核（4185 导出产物 `dist-v24`，真实浏览器）

| 按钮 | 坐标（390×844 视口） | 命中测试 | 点击后行为 |
| --- | --- | --- | --- |
| `审核通过` | x=188, w=43 | ✅ `hitSelf:true` | 直接通过 —— 待审 **4→3**、待处理 **10→9** |
| `审核不通过` | x=239, w=55 | ✅ `hitSelf:true` | 抽屉 `驳回完成提报 / 驳回原因将回流给提报人 / 确认驳回` |
| `审核退回重改` | x=302, w=68 | ✅ `hitSelf:true` | 抽屉 `退回重改 / 退回原因将回流给提报人 / 退回重改原因 / 确认退回` |

- **默认可见**：位于卡片内容区，**无需右滑**；`scrollIntoView` 后 `elementFromPoint` 命中链为 `DIV → BUTTON[role=button] → …`，证明未被遮挡。
- **控制台 0 errors**：原 `<button> cannot be a descendant of <button>` 报错已消除。
- **右滑快捷动作保留**：`通过`/`驳回`/`退回重改`（x=20/96/172，宽 76）。

### 工程师自检

- 全量 `npx jest --config jest.config.js`：**43 套件 / 828 用例全绿**（+1 套件 +7 用例）
- `tsc --noEmit` 零错误
- 裸 `<Pressable>` 白名单仍**恰好 6 个**（`BottomSheet`/`Button`/`Card`/`ScreenHeader`/`SegmentedControl`/`SwipeableRow`）

### QA 独立验证（严过关）—— ✅ IS_PASS: YES · 路由 NoOne

| 项 | 结论 |
| --- | --- |
| 1. 三按钮默认可见 | ✅ 位于 `</SwipeableRow>` **之后**、作为 `FadeIn` 的**兄弟节点**（`styles.reviewActions`）⇒ 既不在 actions 层，也不在 `Card` 的 `Pressable` 内 |
| 2. 门禁正确 | ✅ `:399 isReviewTab = tab === 'review' && canReview`；无权限时三层兜底（`:139` 隐藏选项 / `:151-157` 回落 tab / `:399` 门禁） |
| 3. 三路分支语义 | ✅ `handleApprove` → `reviewSubmission(id,'approve',v)`；`openRejectDrawer` → `reviewSubmission(id,'reject',v,reason,undefined,opinion)` ⇒ reject+reject / reject+rework。RA-4/5/6 实证 |
| 4. 「查看详情」非交互 | ✅ `:541-549` 已是 `Text`+chevron；RA-2 断言 TaskCard 子树内带 label 的 `role=button` 数为 0 |
| 5. 变异测试守护力 | ✅ 见下表 |
| 6. 全量测试 | ✅ `--no-cache` **43 套件 / 828 用例全绿**，271.9s，无失败无超时抖动 |
| 7. 类型检查 | ✅ `tsc --noEmit` exit 0 |
| 8. 裸 `<Pressable>` 白名单 | ✅ 恰好 6 文件（`PressableScale.tsx:36` 为文档注释误报） |

**变异测试矩阵**

| 变异 | 改动 | 实际变红用例 | 判定 |
| --- | --- | --- | --- |
| M1 | `:570` 不通过按钮 `'reject'→'rework'` | RA-5 | ✅ 有守护力 |
| M2 | `:399` 去掉 `&& canReview` | 无（7/7 绿） | ⚠️ **等价变异体**，非盲区 |
| M2c | 同时去掉 `:399` 门禁 + `:153` tab 回落 | RA-3 | ✅ 反证 RA-3 有守护力 |
| M3 | 删除 `:579-589` 退回重改按钮 | RA-1、RA-6 | ✅ 有守护力 |

> M2 说明：member 角色下 tab 无法稳定停在 `'review'`（选项被过滤 + effect 立即回落），移除 `isReviewTab` 的 `canReview` 不改变任何**可达状态**的渲染 ⇒ 等价变异体。M2c 同时移除两层兜底后 RA-3 立刻变红，证明权限保护确实被测试覆盖。

**工作区还原证明**：`git status --short` 仅含 QA 介入前既有改动；`apps/mobile` 未被 git 跟踪，变异全部经 `/tmp/qa-backup` 副本还原，md5 逐字节校验通过（`TodayFocusScreen.tsx` = `80426906713d0c3c57ac10b486efba9a`），无残留。


## 产物与访问

- 导出产物：`apps/mobile/dist-v24`（含修复；旧 `dist-v23` 建于修复前，已弃用）
- 预览地址：**http://127.0.0.1:4185**（移动端）· `http://127.0.0.1:4186`（Web）
- dev server：`http://127.0.0.1:8081`（watch 模式，热重载）

## 已知遗留

1. **`<button>` 嵌套在其它页面仍存在**（非本次修复引入，今日聚焦已消除）：
   - `AuditCenterScreen.tsx:375-411` —— 三枚带 label 的 `PressableScale` 位于 `TaskCard.right`，而 `TaskCard` 恒包 `Card onPress`（`Card.tsx:34` 渲染 `accessibilityRole="button"`）。
   - `BoardScreen.tsx:256-265` —— 「切换状态」按钮同样位于 `TaskCard.right` 内。
   - 机制：RNW 0.21.2 把 `role=button` 渲染为真实 `<button>`（`react-native-web/dist/modules/AccessibilityUtil/propsToAccessibilityComponent.js:15`）⇒ 复现 `<button>` in `<button>` 告警。
   - **根治**：把内联动作按钮移出 `TaskCard.right`，改为卡片下方兄弟节点（与今日聚焦同姿势）。涉及 `TaskCard` 公共契约，建议单开工单。
2. **jest 无法捕获此类告警** —— 现用 `react-test-renderer`（node 环境、无 DOM），不会抛 DOM 嵌套告警；RA-2 只是**结构性近似**。真实告警须在 Expo Web / 浏览器观察（本次已用 4185 产物实测：今日聚焦 0 errors）。
3. 次要：`:399` 的 `canReview` 属**纵深防御**（防一帧闪烁），可达路径下不可独立观测（即 M2 等价变异体的由来）。

## 下一步建议

1. 打开 http://127.0.0.1:4185 → 登录（演示账号一键填入）→ 今日 → 待我审核，直接点验三枚按钮。
2. 若需根治 `AuditCenterScreen` 嵌套，单开任务给 `TaskCard` 增非交互动作槽。
3. 需求池剩余：P2-04 工作台数据卡片 / P1-06 离线态与错误处理 / P2-01 深色模式。
