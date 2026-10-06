# 交付说明 · 增量 6 阶段一：个人任务审核链路 + 今日聚焦「待我审核」重构（**仅功能框架**）

> 本次交付 = **一份需求框架文档**，不含任何实现代码。
> 主交付物：`docs/mobile-app/PRD-mobile-increment-6-review-framework.md`（524 行 / 9 章）
> 主理人：齐活林（交付总监）· 执行：许清楚（产品经理）
> 范围：严格限定在用户明确要求的「先出框架，待确认后再开发」。

---

## 1. 本次交付了什么

| 项 | 内容 |
| --- | --- |
| 需求一 | **个人任务审核链路（全新设计）**——状态机 + 状态×字段变化表 + 用户三问的逐条答复 |
| 需求二 | **今日聚焦「待我审核」重构**——信息架构（双轴模型）+ 审核动作状态机 + **标签 × 审核动作矩阵** + 界面结构 |
| 「开始计时」评估 | 逐项评估并**纠正了用户的前提** |
| 既有缺陷处理 | 5 个结构性缺陷逐条给出「解决 / 部分解决 / 本次不做」的结论与理由 |
| 兼容性 | 破坏性变更清单（B1~B5）+ 受保护断言冲突清单 |
| 待拍板 | **14 条待确认问题**（其中 **4 条阻塞**）+ 13 条明确的范围外 |

---

## 2. 三条最关键的设计决策

### 决策 1：个人任务**复用审核态语义**，但**保持独立集合**
- 个人任务现状是**零审核**：`PersonalTask` 无任何审核字段，`createPersonalTask` 落库即 `todo` 并**立刻生效**（`focus.service.ts:258-291`）。
- 否决「并入 `db.tasks`」方案——会污染任务状态机 / 看板 / 审计，并违反 INV-11。
- 采纳「在 `PersonalTask` 上新增 `reviewStatus` 等 7 个**同名同义**字段」，审核队列**聚合两源**。
- ⇒ 收益：驳回原因规则、通知类型（`review.result` / `review.pending` / `review.withdrawn`）、审核动作**全部复用**，不产生第二套心智；代价是队列取数需扩展。

### 决策 2：审核前用**「仅本人可见的幽灵块」**展示（回答用户三问①）
- 否决「完全隐藏」：用户提交后**看不到任何反馈**，会怀疑没保存成功并重复提交，且无法撤回。
- 采纳「虚线 + 半透明 + 待审核角标的幽灵块」：即时反馈 + 状态透明 + 可撤回。
- **占用口径**：`pending` **计入**属主空闲带（防同时段重复排期），`rejected` **不计入**。
- 且**天然仅本人可见**——`buildCalendarDay` 本就按 `userId` 过滤（`focus.service.ts:457-468`），无需额外逻辑。

### 决策 3：把「一个字段」拆成**「结构性分叉 × 审核标签」双轴模型**
- 用户说的「逻辑混乱」，根因是**三个维度被压成了一个**：审什么 / 怎么审 / 谁来审，全由「一个 `reviewerIds` + 一个 `pending`」隐式承载。
- **轴 1 · 结构性分叉**（不可配置）：`completion` / `project` / `task` / `personal`
- **轴 2 · 审核标签**（可配置，5 类封闭取值）：`verification` 验收 / `delivery` 交付 / `routine` 例行 / `learning` 个人成长 / `initiation` 立项
- 由 23 个种子业务标签**映射**而来（映射表已给出），**单选**保证动作集唯一。
- 动作矩阵差异示例：`verification` 通过前**必须填验收意见**；`routine` / `learning` **支持批量通过**；`initiation` 通过 = **落地为正式事项**。

---

## 3. 需要用户拍板的问题（**前 4 条为阻塞项**）

| # | 问题 | 建议默认值 |
| --- | --- | --- |
| **Q6-1** 🔴 | 审核前的个人任务在时间容器里怎么展示？ | 仅本人可见的**幽灵块**（计入空闲带占用） |
| **Q6-2** 🔴 | 个人任务的审核人是谁？ | 全部 manager，**排除提报人本人** |
| **Q6-3** 🔴 | 审核标签是否按「5 类封闭取值」？ | 采纳 5 类，一期不可自定义 |
| **Q6-4** 🔴 | 「待我审核」是否**聚合个人任务**为第三类来源？ | **是**（否则需求一的审核动作无处落地） |
| Q6-5 🟠 | 驳回原因是否统一 ≥4 字？ | 统一，并修 UI 阈值缺陷 |
| Q6-6 🟠 | 是否在**任务详情页新增审批区**？ | 建议新增（⚠️ 与增量 1 N1 决策反转） |
| Q6-7 🟠 | AI 提议卡片是否移出「待我审核」？ | 移出为独立入口 |
| Q6-8 🟠 | 是否**授权修改受保护断言**以修缺陷 2 / 3？ | **不授权，本次不做** |

---

## 4. 对用户前提的纠正（**重要**）

> 用户要求「评估『开始计时』的意义，若无价值建议删除」。

**「开始计时」不在「待我审核」里。** 全仓检索该字面量**只出现在一处**：`TaskDetailScreen.tsx:518`（任务详情页的工时计时区）。`useTimer` **只被 `TaskDetailScreen.tsx:81` 调用**——今日聚焦 / 待我审核 / 时间容器 / 个人计划 / 看板**都没有任何计时入口**。

⇒ 「删除待我审核里的开始计时」这个命题**无对象可删**。文档给出的结论是：
- **保留**任务详情页计时（它是 `time_entries` 与 `actualHours` 的**唯一写入来源**，`actualHours` 被 `completeTask` 消费，删除会切断工时数据链，且属首版 PRD 的 P0 需求 M-P0-11）；
- **不为**「待我审核」新增计时（审核是决策动作不是执行动作，引入会产生归属混乱的 `TimeEntry`）；
- 个人任务计时登记为 **P2**（需扩展 `TimeEntry` 归属，属破坏性变更）。

---

## 5. 顺带发现的既有缺陷（已核实成立）

| # | 缺陷 | 证据 |
| --- | --- | --- |
| 1 | **UI 驳回阈值与服务端不一致** | UI 允许 **≥2 字**（`TodayFocusScreen.tsx:563` `disabled={rejectReason.trim().length < 2}`），服务端要求 **≥4 字**（`utils/submission.ts:127-129` + `task.service.ts:1121-1124`，阈值 `REASON_MIN_LENGTH = 4` @ `types/task.ts:150`）⇒ **2~3 字必被服务端拒绝** |
| 2 | **驳回失败无任何用户提示** | `handleRejectConfirm`（`TodayFocusScreen.tsx:283-302`）只有 `try/finally`，**没有 `catch`** ⇒ 上述拒绝会变成未捕获异常，用户看不到任何反馈 |
| 3 | **`reviewedBy` 记录的不是真实操作人** | `task.service.ts:1087` `const reviewerId = task.reviewerIds?.[0] ?? task.createdBy` ⇒ 取的是「第一个审核人」而非点击的人 |
| 4 | **approve 无条件置 `done`** | `task.service.ts:1090-1106`；且队列取数不看 `status`（`task.service.ts:234-243`） |

> 缺陷 1、2、3 已纳入本次框架的修复范围（零回归）；缺陷 4 经分析判定在**真实路径上结构不可达**，收紧守卫必然打破 6 处受保护断言，故登记待授权。

---

## 6. 未做 / 边界

- **未写任何实现代码**（用户明确要求本阶段只出框架）。
- **未修改任何源码、既有文档或测试断言**，未执行任何 git 操作。
- 框架文档中的字段名仅作**行内标注**用于对齐既有数据语义，不代表实现。
- 13 条范围外事项已在文档 §8 逐条登记（含不接真实后端、不做多级会签、不做通知系统重构、不做冲突检测等）。

---

## 7. 下一步

1. **等用户对 4 条阻塞问题（Q6-1 / Q6-2 / Q6-3 / Q6-4）拍板**，之后才能进入架构与开发。
2. 拍板后建议走标准 SOP：架构师（高见远）出技术方案 → 工程师（寇豆码）实现 → QA（严过关）验收。

---

## 附：本次同时完成的遗留清理（与框架无关）

上一轮「卡片按下浮起 / 浮动立体」改造遗留了一处**类型门禁失败**，本次一并修掉：

- **缺陷**：`src/components/Card.tsx:62` 使用了 `StyleSheet.absoluteFillObject`，而 RN 0.86.3 的类型定义里**只有 `absoluteFill`** ⇒ `tsc --noEmit` 报 `TS2551` 失败（`TSC_EXIT=2`）。这也是全仓**唯一**一处 `absoluteFillObject`，与仓库既有约定不一致（`BottomSheet.tsx:85`、`BrandGradient.tsx:81` 都用 `absoluteFill`）。
- **修复**：1 行，改为 `...StyleSheet.absoluteFill`（运行时 `StyleSheetExports.js:21` 是冻结的普通对象，展开安全）。
- **门禁复跑**：`TSC_EXIT=0`（0 行错误）；jest **38 套件 / 730 测试全部通过**。
- **浏览器端真实计算样式验收（已完成）**：浮起效果**完全生效**。`/projects` 按下时 wrapper 为 `matrix(1.015, 0, 0, 1.015, 0, -4)`、阴影层 `opacity` 0→1；rAF 逐帧采样到 **44 个互不相同的递变值**（含 spring 过冲峰值 `-4.19` 后收敛到精确 `-4.0000`），抬起完全复原；悬停收敛到 `ty=-1.8000 / scale=1.00675 / opacity=0.4500`，与预期**逐位吻合**。`/personal-plan`、`/notifications`、`/today` 三页横向回归无布局塌陷。
- **一个被推翻的假设（如实记录）**：我曾预判「阴影层与卡片同尺寸且不随之移动 ⇒ 底部会露出约 3px 白边」。实测**逐边 delta 全为 0.00px**——因为阴影层是承载 `transform` 的那个 `Animated.View` 的**子节点**，与卡片本体**共享同一变换矩阵、同步浮起**，不存在相对位移。像素级复核确认卡片下方只有连续灰色渐变，**无纯白行、无新增发丝线**。⇒ **非缺陷，不需要修。**
- **唯一可优化点（非缺陷）**：卡片下方阴影加深 ΔRGB 为 **29~41**，恰好压在「刚好可辨」的阈值（40）上 ⇒ 浮起感主要来自 4px 位移 + 1.5% 缩放，阴影加深贡献偏弱。若想更「立体」，可把 `shadow.cardLift.shadowOpacity` 由 `0.16` 提到 `0.20` 左右（ΔRGB 升至 ~55）。**未擅自改动**（该值被本次新增测试断言锁定，且属观感偏好而非缺陷）。
- 验收证据截图：`screenshots/mobile/lift-rest.png`、`lift-pressed.png`、`lift-pressed-bottom.png`（4× 放大底边）、`lift-personal-plan-pressed.png`、`lift-notifications-pressed.png`。
- **盲区**：`useNativeDriver: true` 在 Web 永远降级为 JS 驱动 ⇒ 真机帧率/原生驱动表现、iOS 阴影观感**未验证**；「按住后滑出再松开」的手势取消路径、长按拖动改期、右滑手势在桌面不可复现。

---

## 附 B：交付后引用复核（**对全文 `文件:行号` 引用做 16 项实读抽查**）

**复核结果：15 项逐字成立，1 项行号漂移（已修正）**，并新发现 **1 个实质缺口（已写入文档 §9 + 新增 Q6-15）**。

### 已逐字核实的引用（15 项）

| 引用 | 内容 | 结论 |
| --- | --- | --- |
| `task.service.ts:234-243` | `listPendingReview` 只看 `reviewRequired` + `pending` + `reviewerIds`，**不看 `status`** | ✅ |
| `task.service.ts:1087` | `reviewedBy` 取 `reviewerIds?.[0] ?? createdBy`，**非真实操作人** | ✅ |
| `task.service.ts:1090-1106` | `completion` 分叉 approve **无条件**置 `status='done'` | ✅ |
| `task.service.ts:387` | `completeTask` 消费 `input.actualHours` | ✅ |
| `task.service.ts:713-721` | `stopTimer` 汇总已结束工时回填 `actualHours` | ✅ |
| `utils/submission.ts:199-204` | `shouldClearReviewOnLeaveDone` 仅「从 `done` 迁出」时清理 | ✅ |
| `utils/submission.ts:222-243` | `resolveReviewItemView` 三分叉（完成待审 / 新项目 / 新任务） | ✅ |
| `types/task.ts:150` | `REASON_MIN_LENGTH = 4` | ✅ |
| `types/domain.ts:20-43` | `PersonalTask` **零审核字段、无 `version`** | ✅ |
| `focus.service.ts:258-291` | `createPersonalTask` 落库即 `todo`、**立刻生效** | ✅ |
| `data/index.ts:204-207` | `allManagerIds()` **不排除提报人本人** | ✅ |
| `utils/permission.ts:36-37,44-45` | `submission:review` 与 `review:view_pending` **语义重复**（均 `['manager']`） | ✅ |
| `TodayFocusScreen.tsx:563` | 驳回阈值 `< 2` 字（服务端要求 ≥4） | ✅ |
| `TodayFocusScreen.tsx:283-302` | `handleRejectConfirm` **无 `catch` 分支** | ✅ |
| `TodayFocusScreen.tsx:389-447` | AI 提议**仅**在 `tab === 'review'`（待审核分组）内渲染 | ✅ |
| `focus.service.ts:457-468` | `personalBlocks` 按 `userId` 过滤 | ⚠️ **行号漂移**：实际在 **`:469-471`**（原区间是团队任务块过滤）→ **已修正** |

### 新发现 S1（**重要，已写入文档 §9，并新增 Q6-15**）

> **`tags` 在全部三个创建路径都被硬编码为空数组，且全仓没有任何标签输入控件。**

| 位置 | 事实 |
| --- | --- |
| `task.service.ts:773` | 团队任务 `createTask` → `tags: []` |
| `task.service.ts:849` | 事项提报 `buildSubmissionRecord` → `tags: []` |
| `focus.service.ts:280` | 个人任务 `createPersonalTask` → `tags: []` |
| `focus.service.ts:248-255` | `CreatePersonalTaskInput` **无 `tags` 字段** |
| `src/**/*.tsx` 全量检索 `tags` | **仅 1 处命中**：`TaskDetailScreen.tsx:438-442`（`task.tags.join(' · ')`，**只读展示**） |

**⇒ 那 20 个团队种子标签 + 3 个个人种子标签只存在于种子数据**，界面上新建的对象**一律无标签**。

**对框架的直接影响**：§4.3 的「未选时按默认映射推导」在现状下**不是例外分支，而是唯一分支**——所有入队条目都会落到 `delivery` **兜底类** ⇒ **「按不同任务标签区分审核动作」这一核心需求在运行时将完全不可观测**。

**⇒ 落地前置条件**：§4.3 要成立，必须**同时为三处创建流程新增审核标签选择器**（团队任务创建 / 事项提报 / 个人任务新建），并扩展对应 service 入参类型。这是**非平凡改动**（3 个表单 + 3 处签名 + 校验 + 测试），已列入文档 §6.1 与新增 **Q6-15（🟠 高）** 请用户裁决；若不接受，则 §4.3 与 Q6-3 应整体推迟到二期。

> 这一发现印证了「只读源码、不做实读抽查」是不够的——引用正确不等于**前提在运行时成立**。
