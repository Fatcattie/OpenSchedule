# 交付概览 — 设计语言升级：圆润化 + 交互动效丝滑化

- **项目**：OpenSchedule 移动端（`apps/mobile`，Expo 57 / RN 0.86.3 / React 19 / React Navigation v7）
- **需求原话**：「整体UI 再圆润点，多圆角设计，交互上再丝滑一点」
- **工作流**：⚡ 快速模式（工程师寇豆码 → QA 严过关），共 5 轮实现 + 2 轮 QA
- **日期**：2026-09-28
- **状态**：✅ 已完成（静态 / 709 测试 / 浏览器实测 三层验证通过，路由判定 `NoOne`）

---

## 1. TL;DR

以**设计 token 为唯一入口**做了一次全局设计语言升级：圆角五档整体上调、阴影同步柔化、按压反馈从"只有 2 处"扩展到**全站 44 处**并改用弹簧动画、补齐页面转场与 Tab 切换动画。因为项目**零硬编码圆角**（81 处引用全部走 token），改一处即全站生效。

后续两轮为**收尾精修**：修掉「圆角容器内首/末行按下底色方角溢出」（3 处），并把 TabBar 从通栏直边条改成**圆角顶 + 向上柔和投影**，最后清零了 React Navigation 默认透传的 1px hairline 上边框。

---

## 2. 三层改造内容

### 轴一 · 圆角尺度整体上调

| 档位 | 原值 | 新值 | 用途 |
|---|---|---|---|
| `sm` | 8 | **12** | 小控件 / 图标底 / 骨架块 |
| `control` | 12 | **16** | 按钮 / 输入框 / 分段控件 |
| `card` | 16 | **20** | 卡片 / 列表块 |
| `sheet` | 20 | **28** | 抽屉顶部 |
| `pill` | 999 | 999 | 标签 / 胶囊（不变） |

**阴影同步柔化**（大圆角配硬阴影会显脏，故半径放大、透明度降低）：

| 档位 | opacity | radius | offset | elevation |
|---|---|---|---|---|
| `card` | .06 → **.05** | 8 → **12** | {0,2} → **{0,3}** | 2 |
| `raised` | .10 → **.08** | 16 → **22** | {0,-4} → **{0,-6}** | 8 |
| `floating` | .16 → **.14** | 20 → **26** | {0,6} → **{0,8}** | 10 → **12** |

### 轴二 · 交互丝滑化（本次最大的实质提升）

**问题诊断**：改造前全站约 50 个可点元素中，**只有 `Button` 与 `Card` 两处有按压反馈**——列表行、菜单行、页头按钮、图标按钮按下去全是"死的"。这种"卡片会弹、旁边的行不会弹"的不一致，比"完全没有动效"更显廉价。

**动效基础设施**：
- `usePressScale` 由 `Animated.timing`（150ms 线性缓动）改为 **`Animated.spring`**，新增 `motion.spring.press { damping:18, stiffness:320, mass:0.7 }`（临界附近阻尼，跟手且无可见过冲）
- 时长调整：`fast 150→140`、`base 220→240`、`slow 320→340`；`stagger 40→45`、`staggerMax 6→7`、`enterOffset 8→12`
- `spring.sheet` 调整为 `{24, 200, 0.9}`（更绵软）

**新增共享组件 `src/components/PressableScale.tsx`**：可直接替换 `<Pressable>`，内置弹簧缩放 + 可选按下底色。

> ⚠️ **关键实现决策**：用 `Animated.createAnimatedComponent(Pressable)` 让 scale **直接作用于 Pressable 自身**，而不是外层包一层 `Animated.View`。外层包裹会破坏 FAB 的绝对定位与全宽行的 `flex:1` 主轴尺寸。

**反馈覆盖策略（分两类，这是手感好坏的关键）**：

| 类型 | 处理 | 原因 |
|---|---|---|
| **全宽列表行 / 菜单行** | `scale={1}` + 按下底色 `#F1F3F7` | 整行缩放会在视觉上"晃"，显廉价；底色是主流约定 |
| **非全宽**（图标 / Chip / FAB） | `scale 0.92~0.96` | 小目标缩放才有"跟手感" |
| 已有反馈的 `Button` / `Card` / `ScreenHeader` | **不动** | 避免双重缩放（0.97×0.98≈0.95） |

**覆盖成果**：`<PressableScale>` 调用点 **44 处、15 个文件**（scale 分布 0.92×5 / 0.94×7 / 0.96×15 / 0.98×1 / 1×16）。裸 `<Pressable>` 仅剩 6 处刻意跳过项（抽屉遮罩、Button、Card、ScreenHeader、分段控件、滑动操作按钮——均自带反馈）。

### 轴三 · 导航转场

- `stackScreenOptions` 增加 `animation: 'slide_from_right'` + `animationDuration: motion.duration.slow`（≈340ms）——此前**完全没有页面转场动画**
- `MainTabs` 增加 `animation: 'shift'`，并给选中 Tab 加**圆角胶囊底色**（`colors.primaryFaint` + `radius.control`）——同时满足"多圆角"与"丝滑"
- `AiProposalSheet` 原有的 `transparentModal` + `fade` **原样保留**

> ⚠️ **诚实声明（实测后发现，务必注意）**：**这两条动画在 Web 上表现不同**。
> - **Tab `shift` 切换：Web 上确实有补间** ✅ —— 实测到「进入屏从 `tx=+50` 滑到 `0`」且「离开屏从 `0` 滑到 `tx=-9.2`」的横向位移序列（22 帧横向值）。
> - **Stack `slide_from_right` 推入：Web 上没有横向滑动** ❌ —— 全页 `tx` 恒为 `0`，只观察到 `ty: 12 → 0` 的**纵向入场位移**（即本项目自己的 `motion.enterOffset` 入场动画），说明 `react-native-screens` 的 native-stack 动画**未在 Web 实现**，Web 上是瞬时切换。
> - `slide_from_right` / `animationDuration` 是 **native-stack（iOS/Android）能力**，配置已正确写入，预期在真机生效，但**本次未在真机验证，不能声称已通过**。
> - 换言之：Web 预览上"丝滑"的可感知来源是 **按压反馈 + Tab shift + 12px 入场位移**，**不含**页面推入滑动。

### 轴四 · 收尾精修（第 4–5 轮）

**(1) 圆角容器内首/末行「方角溢出」** —— 真缺陷，浏览器实测抓到

卡片是 `radius.card`(20px) 圆角，但内部行是直角且卡片**没有** `overflow:hidden`。给行加按下底色后，按住首行/末行时方角会**戳出卡片圆角**。实测证据：`row.borderRadius = "0px"` vs `card.borderRadius = "20px"`、`card.overflow = "visible"`；缺陷截图 `defect-pressed-row-corner.png`。

> ⚠️ **修复手法**：**禁止**用 `overflow:'hidden'` 修——RN iOS 上它会同时裁掉同层阴影（`masksToBounds`）。正确做法是给首/末行补对应角的 `borderRadius` token。

修复 3 处：`ProfileScreen` 的 `SettingRow`、`WorkspaceScreen` 的 `feedItem`、`TaskDetailScreen` 的 `attachmentRow`，均用 `radius.card`。

**(2) TabBar 去硬直边** —— 通栏直边条 → 圆角顶 + 向上柔和投影

`MainTabs` 的 `tabBarStyle` 增加 `borderTopLeftRadius/borderTopRightRadius = radius.sheet`(28px) 与 `...shadow.raised`（向上投影 `0,-6`）。

**(3) 清零导航默认 hairline 上边框** —— 第 5 轮，1 行修复

第 (2) 步做完后**实测发现**：`borderTopWidth` 仍是 `1px`、颜色 `rgb(236,238,242)`（正好 = `colors.border` #ECEEF2）。根因是 `@react-navigation/bottom-tabs` 默认 `tabBarStyle` 里的 hairline 上边框被**透传**下来，我们从未覆盖它——于是成了「28px 圆角 + 向上投影 + 1px 硬线」三重叠加，与注释声明的「去硬直边」自相矛盾。修复：`tabBarStyle` 内加 `borderTopWidth: 0`。并补了一条**回归守卫**（因为只要停止覆盖，导航默认值就会把它静默加回来）。

---

## 3. 浏览器实测证据（读计算样式，非看源码）

在真实浏览器对元素派发 `pointerdown`（**不派发 click**，避免误触发跳转），等弹簧收敛后读 `getComputedStyle`。

### ① 圆角 / 阴影前后对照（同一屏 `/workspace` @ 390×844）

| 实测值 | 改造前 `dist-v10` | 改造后 `dist-v11` |
|---|---|---|
| 卡片圆角 | `16px ×18` | **`20px ×18`** |
| 控件圆角 | `12px ×6` | **`16px ×16`** |
| 胶囊 | `999px ×13` | `999px ×13`（不变） |
| 左侧色条 | `16px 0 0 16px ×5` | **`20px 0 0 20px ×5`** |
| 阴影 | `rgba(27,42,74,.06) 0 2px 8px` | **`rgba(27,42,74,.05) 0 3px 12px`** |

### ② 按下底色（`/me` 页全宽行）

| 目标行 | 按下前 | 按下中 | 抬起后 |
|---|---|---|---|
| 通知偏好 | `rgb(255,255,255)` | `rgb(241,243,247)` | `rgb(255,255,255)` |
| 个人计划 | 同上 | 同上 | 同上 |
| 关于 OpenSchedule | 同上 | 同上 | 同上 |

且这几行 `transform` 恒为 `1` —— **符合设计意图**（全宽行只做底色、不缩放）。

### ③ 弹簧缩放（`/task/task-009` 页）

| 目标 | 按下前 | 按下中 | 抬起后 |
|---|---|---|---|
| 「查看依赖」图标 | `1` | **`0.921`** | `1` |
| 「添加附件」图标 | `1` | **`0.921`** | `1` |
| 页头「返回」键 | `1` | **`0.921`** | `1` |

`0.921` 是弹簧向 0.92 收敛的结果，抬起精确回到 `1`。

### ④ 控制台

`/workspace`、`/me`、`/task/task-009` 三页**全部 0 error**。

### ⑤ TabBar 定位纠错与最终取证

**踩坑**：第一版探针用启发式定位（`width>300 && height>40 && 圆角≠0` 取首个），**抓错了元素**——命中的是一张卡片（`20px` 圆角 + `1px` 上边框 + 向下投影 `0 3px 12px`）。改用 `boxShadow` 含 `-6px`（`shadow.raised` 特征）精确定位后才拿到真值。**教训：定位要按语义/独有特征，不要用尺寸启发式。**

| 属性 | 修复前 `dist-v12` | 修复后 `dist-v13` |
|---|---|---|
| **`borderTop`** | **`1px solid rgb(236,238,242)`** ⚠️ | **`0px solid rgb(236,238,242)`** ✅ |
| `borderTopLeftRadius` / `borderTopRightRadius` | `28px` | `28px` |
| `boxShadow` | `rgba(27,42,74,0.08) 0px -6px 22px` | 同（未变） |
| `height` / 位置 | `56` @ `y=788` | 同（未变） |
| `padding` | `4px 0px 0px` | 同（未变） |
| `overflow` | `visible`（未用 `hidden`） | 同（未变） |
| 选中 Tab 胶囊 | ✅ | ✅ |

**⑤-a 圆角容器末行分隔线**（我主动排查的连带风险）：实测 `/me` 设置卡 4 条行分隔线**只出现在行与行之间**，最后一行「关于 OpenSchedule」无下边框 ⇒ 不存在「笑脸线」，**非缺陷，未改**。

**⑤-b 圆角弧外露父底色**（工程师标记的风险）：确实存在——TabBar 后是 `rgb(247,248,250)`（`bg.base`），条身 `rgb(255,255,255)`。但 RGB 差仅约 **3%**，与先前被判定为「静默失败」的量级相同，肉眼几乎不可辨，观感上更像刻意的悬浮圆角条 ⇒ **判定为非缺陷，未改**。

### ⑥ 全路由控制台扫描（`dist-v13`，7 条路由）

`/workspace`、`/today`、`/projects`、`/time`、`/me`、`/notifications`、`/task/task-009`
→ **7/7 均落在正确路径**（无静默回退到 `/workspace`），**0 error**。

仅有 2 类非错误日志：
- `[WARNING] Animated: useNativeDriver is not supported because the native animated module is missing` —— **RN Web 环境固有**（无原生动画模块），弹簧自动降级为 JS 驱动，动画仍正常（实测缩放已收敛到 `0.921`）
- `[VERBOSE] [DOM] Password field is not contained in a form` —— 浏览器对登录页的 DOM 提示，与本需求无关

### ⑦ 动画是否真的在跑 —— 用 rAF 采样 `transform` 的**数值序列**证明

截图只能拍到一帧，容易把「瞬时切换」误判成「有动画」。**做法**：`requestAnimationFrame` 逐帧收集全页所有非 `none` 的 `transform`，看是否出现**多个不同的位移值**（补间），而不是只有首尾两态。

| 动作 | 实测到的位移序列 | 判定 |
|---|---|---|
| **Tab 切到「今日」** | 进入屏 `tx: 50 → 49.27 → 48.25 → 46.37…→ 0`；离开屏 `tx: 0 → -0.73 → -1.56 → -3.63 → -9.17` | ✅ **有横向补间**（22 帧横向值） |
| **点卡片推入 `/task/task-012`** | `tx` 恒为 `0`；只有 `ty: 12 → 11.7 → 10.02 → 8.04 → … → 0.015` | ❌ **无横向滑动**，只有 12px 纵向入场（`motion.enterOffset`） |

### ⑧ 「硬边泄漏」全路由系统排查

既然 TabBar 那条 1px 硬边是**库默认样式透传**造成的，就用它的**通用签名**把全站扫一遍：**元素有圆角、但只有上边或下边有边框（左右为 0）**。正常卡片是四边都有边框，所以不会误报。

7 条路由结果：**仅 2 处命中，且均为预期**——
- `/me` 首行「通知偏好」：`radius: 20px 20px 0 0` + `borderBottom: 1px` ⇒ 这是「首行圆角顶 + 与下一行之间的分隔线」，**设计如此**
- `/workspace` 首条 feed：同上（`feedItemFirst` + 行分隔线），**设计如此**

其余 5 条路由 **0 命中** ⇒ 该缺陷类在全站**已被排干净**，TabBar 是唯一一处。

### ⑨ 底部抽屉（BottomSheet）实测

打开「退出登录」确认抽屉实测：本体 `radius: 28px 28px 0 0`、`boxShadow: rgba(27,42,74,.08) 0 -6px 22px`（与 TabBar 同一套语言）、`borderTopWidth: 0`（无泄漏）、把手 36×4 / `radius: 999px`、遮罩 `rgba(27,42,74,0.45)`。截图 `sheet-check.png`。**顺带再次确认 TabBar 修复在 `/me` 路由同样生效（`borderTop: 0px`）。**

---

## 4. 工程门槛（实测）

| 项目 | 结果 |
|---|---|
| `npx tsc --noEmit` | ✅ 退出码 0 |
| `npx jest --config jest.config.js` | ✅ **37 suites / 709 tests 全绿**（基线 677 + 首轮 QA 新增 30 + 收尾新增 2） |
| 新增 npm 依赖 | ✅ **0**（`package.json` 未改动） |
| `react-native-reanimated` / `gesture-handler` | ✅ **0 引用**（项目明令禁用） |
| 硬编码 `borderRadius: <数字>` | ✅ **0**（全部引用 `radius.*`） |
| `pressedBg={colors.bg.surface}` 提亮写法残留 | ✅ **0** |
| 既有测试断言被修改 | ✅ **无**（mtime 证据：源码改动窗 01:09–01:19，既有测试最新 mtime 00:31） |
| 用 `overflow:'hidden'` 修方角溢出 | ✅ **0 处**（RN iOS 会连带裁掉同层阴影，硬红线） |
| TabBar hairline 回归守卫 | ✅ 已加（正断言 `borderTopWidth: 0` + 反向断言块内不得出现 `borderTopWidth: 1` / `borderTopColor`） |
| `git` 状态 | ⚠️ `apps/mobile/` 整个目录 **untracked**（仓库仅有初始提交 + CI），故本轮无 commit / 无 hash |

**QA 路由判定：`NoOne`**（无源码 Bug、无测试 Bug、无遗留阻断项）。

---

## 5. 文件清单

**新增**
- `apps/mobile/src/components/PressableScale.tsx` — 通用按压反馈封装
- `apps/mobile/tests/increment-ui-polish.test.tsx` — QA 新增 **32** 个回归用例（首轮 30 + 收尾 2）
- `screenshots/mobile/ui-before-workspace.png`、`ui-after-workspace.png`、`ui-before-profile.png`、`ui-after-profile.png`
- `screenshots/mobile/defect-pressed-row-corner.png`（方角溢出缺陷取证）、`fix-pressed-row-corner.png`（修复后）
- `screenshots/mobile/tabbar-after.png`、`tabbar-zoom.png`（`dist-v12`，可见 1px 硬线）、`tabbar-fixed.png`、`tabbar-fixed-zoom.png`（`dist-v13`，硬线消失）
- `screenshots/mobile/ui-probe.js`（圆角/阴影直方图）、`press-probe.js`（按下底色）、`press-probe-scale.js`（弹簧缩放）、`tabbar-probe.js`（按 `role=tablist` 定位）、`tabbar-border.js`（按 `-6px` 上投影特征定位）、`e2e-login.js`（演示账号登录）、`pw.js`（CLI 封装）、`spa-server.py`（SPA 回退静态服务）
- `overview-mobile-ui-polish.md`（本文件）

**修改（核心）**
- `src/theme/tokens.ts` — radius / shadow / motion（含新增 `spring.press`）
- `src/hooks/usePressScale.ts` — timing → spring
- `src/components/Card.tsx` — 新增可选 `pressScale`（默认 0.97，向后兼容）
- `src/components/TaskCard.tsx` / `ProjectCard.tsx` — 传 `pressScale={0.98}`
- `src/components/ScreenHeader.tsx` — 返回键接入按压反馈
- `src/navigation/stacks.tsx` — 页面转场
- `src/navigation/MainTabs.tsx` — Tab 切换动画 + 选中胶囊 + **圆角顶/向上投影** + **`borderTopWidth: 0`**（清零导航默认 hairline）

**修改（收尾精修，首/末行补角）**
- `src/screens/ProfileScreen.tsx`（`settingRowFirst/Last`）
- `src/screens/WorkspaceScreen.tsx`（`feedItemFirst/Last`）
- `src/screens/TaskDetailScreen.tsx`（`attachmentRowFirst/Last`）

**修改（可点元素接入，共 15 文件）**
`screens/`: TaskDetail / Board / Login / Notifications / Submission / PersonalPlan / Calendar / Workspace / Profile / ProjectList
`components/`: PickerSheet / TimelineBlock / DateTimeField / ItemForm / UndoToast

---

## 6. 用户下一步建议

1. **浏览器验收**（手机视口 390×844 效果最佳）：
   - **最新（含收尾精修）** `http://127.0.0.1:4183/` ← 建议看这个
   - 设计语言升级首版 `http://127.0.0.1:4181/`
   - 改造前对照 `http://127.0.0.1:4180/`
   - 演示账号一键登录：`zhangwei@example.com` / `openschedule`
   - 建议动线：登录 → 工作台（看卡片圆角与阴影）→ 点任一任务（看页面转场）→ 底部切 Tab（看胶囊与 shift 动画）→ 我的（长按任一设置行看按下底色）
2. **重点体感项**：卡片/按钮/图标的**弹簧按压**、**页面左右推入**、**Tab 切换**——这三项是"丝滑"的主要来源
3. **可选后续优化**（本次未做，需要可继续）：
   - 底部 TabBar 已改为**圆角顶 + 向上投影**；若要更彻底可改为**悬浮圆角胶囊 TabBar**（需同步改 10+ 屏的 `paddingBottom`，因绝对定位会遮挡内容，故本轮刻意未做）
   - 卡片内分隔线目前是通栏，可改为**内缩**以呼应圆角语言（审计后判定非必须）
   - `LoginScreen.tsx:238` 演示账号卡用 `scale={0.98}`，若要与"非全宽 0.92~0.96"严格对齐可改 0.96（QA 判定当前选择合理，非必须）
   - `EMPTY_VIEW_STYLE` 仅在模块级导出，未走 `hooks/index.ts` 桶导出（全仓无消费方，低风险）
   - `apps/mobile/dist-v4` … `dist-v13` 构建产物堆积，可手动清理
4. **注意**：端口 **4173 永久避用**（被另一项目的 `vite preview --strictPort` 以 IPv6 独占）

---

## 7. 结论

需求的两半都落地并被实测验证：
- **"更圆润 / 多圆角"** —— 五档圆角整体上调 + 阴影柔化，浏览器实测计算样式已确认生效；收尾再修掉「圆角容器内首/末行方角溢出」3 处，并把 TabBar 改成圆角顶 + 向上投影、清零其 1px 默认硬边
- **"交互更丝滑"** —— 按压反馈从 2 处扩展到 44 处并改用弹簧动画，页面转场与 Tab 切换动画补齐，按下底色与缩放均经实测确认可见、可复原

三层验证（静态 `tsc` / 709 单测 / 浏览器实测）全部通过，QA 路由判定 `NoOne`。

### ⚠️ 盲区（如实声明，不冒充已验证）

- **`slide_from_right` 页面推入滑动未在 Web 生效**，只观察到 12px 纵向入场位移（见 §3-⑦）。该能力属 native-stack（iOS/Android），配置已正确写入，**但本次未在真机验证**。
- **手势（`SwipeableRow` 右滑）在浏览器里不可靠**（`PanResponder` 不响应鼠标事件），未纳入本轮验证。
- **真机性能与手感**（弹簧跟手度、60fps 是否掉帧）只能上真机判断。

**本轮方法论上最有价值的一条**：TabBar 那条 1px 硬边是**只有读计算样式才能发现**的缺陷——源码里完全看不出问题（我们的 `tabBarStyle` 一个字都没写错），是导航库的默认值在透传。同理，"按下底色提亮 3% 不可见"、"圆角溢出方角"也都是靠**实测计算样式**抓出来的。这类"静默失败"必须靠浏览器取证，靠读源码永远抓不到。**而反过来，动画这类"看起来应该有"的东西也必须实测**——否则很容易把「配了参数」当成「已经生效」。
