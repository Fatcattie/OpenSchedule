# 交付概览：`<button>` 嵌套根治（审核中心 + 看板）

> 团队 `software-mobile-nested-button` · 项目 `apps/mobile`（Expo SDK 57 / RN 0.86）
> 日期：2026-10-05

## TL;DR

消除了 `apps/mobile` 中 `<button>` 嵌套 `<button>` 的非法 DOM —— 审核中心（`AuditCenterScreen`）与项目看板（`BoardScreen`）把交互元素从 `TaskCard` 的 `right` 插槽移出，改为卡片下方兄弟节点。**真实浏览器 A/B 实测：两页嵌套 button 从 12 → 0。**

## 根因

| 环节 | 说明 |
|---|---|
| 1 | `Card.tsx:34-35` —— 传入 `onPress` 时渲染 `<Pressable accessibilityRole="button">` |
| 2 | React Native Web 把 `accessibilityRole="button"` 渲染为**真实 `<button>`**（`react-native-web/dist/modules/AccessibilityUtil/propsToAccessibilityComponent.js:15`） |
| 3 | `TaskCard.tsx:73` **恒**给 `Card` 传 `onPress`；`:89` 的 `right` 插槽与 `:128` 的 `footer` 插槽渲染在其**内部** |
| 4 | ⇒ 插槽内任何交互元素（`Button` / `PressableScale`）都嵌套 |

**穷举结果**：全仓 `TaskCard` 的 `right` 插槽只有两处含交互元素 —— `AuditCenterScreen:375`（三枚审核按钮 **+** `:413` 的 `<Button label="审核">`，后者常被漏掉）与 `BoardScreen:256`（`⋯` 切换状态）。`TodayFocusScreen:537` 的「查看详情」已是非交互 `Text`。

## 改动清单（4 文件，零新增依赖）

| 文件 | 改动 |
|---|---|
| `src/screens/AuditCenterScreen.tsx` | 删掉 `right` prop；三枚审核按钮 + `<Button label="审核">` 改为 `</TaskCard>` **之后**的 `auditActionsBelow` 行（横排右对齐）。`onPress`/`accessibilityLabel`/文案/配色**逐字保留**；删除未使用的 `auditActions`、`auditActionRowSecond` |
| `src/screens/BoardScreen.tsx` | 删掉 `right` prop；`⋯` 改为卡片下方 `cardMenuRow` 右对齐行；`cardMenu`/`boardCardGap` 保持 |
| `tests/no-nested-buttons.test.tsx`（新增） | 4 例结构性断言（NB-1..NB-4）：宿主 button 子树内不得再有宿主 button；且按钮「仍存在」 |
| `tests/react-test-renderer.d.ts`（新增） | `react-test-renderer` 类型兜底声明 |

**`TaskCard.tsx` 与 `TodayFocusScreen.tsx` 未改动**（公共契约保持不变，靠调用方挪位置实现）。

### 关键设计决定

看板的 `⋯` 从**卡片右上角**移到**卡片下方右对齐一行**。**绝对定位被否决**：`Card` 的按压浮起动效在内层 `Animated.View` 上（`Card.tsx:31`），绝对定位的兄弟节点不会跟随上浮（视觉穿帮），且会与标题文字重叠。

## 验证结果

### 主理人：真实浏览器 A/B（决定性证据）

对照组 `dist-v24`（修复前）跑在 4187，实验组 `dist-v25`（修复后）跑在 4185，用 `document.querySelectorAll('button button')` 直接统计 DOM 嵌套：

| 页面 | `dist-v24` 修复前 | `dist-v25` 修复后 |
|---|---|---|
| `/audit-center` | 17 buttons / **12 nested** | 17 buttons / **0 nested** ✅ |
| `/projects/project-001` | 25 buttons / **12 nested** | 25 buttons / **0 nested** ✅ |
| `/today` | 10 buttons / 0 nested | 10 buttons / 0 nested ✅ |

- **总 button 数完全不变**（17/25/10）⇒ 按钮都还在，只是不再嵌套（无功能损失）。
- 修复前 `/audit-center` 的 12 = 4 张卡 × 3 枚按钮，样本 aria-label 为 `审核通过`/`审核不通过`/`审核退回重改`；看板的 12 个样本 aria-label 为 `切换状态`。

### QA 独立验证（严过关）—— ✅ IS_PASS: YES · 路由 NoOne

| 变异 | 改动 | 实际变红用例 | 判定 |
|---|---|---|---|
| M1 | 三枚审核按钮放回 `TaskCard right` | NB-1、NB-2 | ✅ 定向触发 |
| M2 | 看板 `⋯` 放回 `TaskCard right` | NB-3、NB-4 | ✅ 定向触发 |
| M3 | 删除「退回重改」按钮 | NB-1（「仍存在」断言） | ✅ |

- 变异为**定向**触发（M1 只红审核组、M2 只红看板组），无交叉污染，未发现盲区。
- 全量 `--no-cache`：**44 套件 / 832 用例全绿**（236.5s）；`tsc --noEmit` exit 0；裸 `<Pressable>` 恰好 6 个。
- 行为回归：三枚按钮分别落到 `approve+agree` / `reject+reject` / `reject+rework`；`<Button label="审核">` 回退分支可用；看板 `⋯` 仍能打开状态切换抽屉。

## ⚠️ 顺带修正的一个既有问题（此前多轮结论不准确）

工程师新增的 `tests/react-test-renderer.d.ts` **并非只服务于新测试**。实测：

- 移除该文件后 `npx tsc --noEmit` **exit 2**，报错横跨 **16 个既有测试文件**（TS7016 + 派生 TS7006）。
- 原因：`react-test-renderer@19.2.3` 无 `types` 字段、包内无 `.d.ts`、未安装 `@types/react-test-renderer`。
- ⇒ **本次修复之前，`tsc --noEmit` 本来就不干净**。此前多轮汇报中的「`tsc` 零错误」不准确（应是只看了 `src/` 或未读退出码）。
- 该 d.ts 补齐模块类型后 TS7016 与其下游 TS7006 一并消失，属**治本**。
- **风险**：`props: Record<string, any>` 弱化测试侧类型；若将来安装官方 `@types/react-test-renderer`，本地 ambient 声明可能冲突，届时须删除本文件。

## ⚠️ 另一个方法论修正：生产包的控制台检查是无效证据

`<button> cannot be a descendant of <button>` 是 React DOM 的 `validateDOMNesting` 告警，**只在 DEV 构建存在**。实测 `dist-v25` 生产包中：

```
"cannot be a descendant of" 出现次数 = 0
"validateDOMNesting"        出现次数 = 0
```

而 dev bundle（8081，`dev=true`）中出现 **1** 次（机制确实存在）。

⇒ **「生产预览（4185）控制台 0 errors」证明不了嵌套已消除** —— 生产包永远是 0。此前用该结论佐证嵌套修复是无效的（今日聚焦那轮的**结构性证据仍然成立**：按钮坐标、`hitSelf` 命中测试、三路分支点击行为均有效）。
⇒ 正确做法：① 查 DOM 结构 `button button`（任何构建都有效，本次采用）；② 或在 **dev server** 上查控制台。

## 遗留问题

1. **`TaskCard.right`/`footer` 仍是「潜在陷阱」** —— 未来若再把交互元素塞进这两个插槽，嵌套会复现（`TaskCard` 契约刻意未改）。可考虑加 eslint 规则或组件级开发期告警。
2. **`<Button label="审核">` 回退分支缺结构性回归守护** —— NB-1/NB-2 的场景恒为 `showInlineAudit=true`，该分支不渲染。QA 已用临时测试确认它**当前**正确，但若日后被误移入 `right`，现有 4 例不会变红。建议补 1 例（member 兼提报人场景）。
3. **dev server 上的浏览器 E2E 无法完成** —— `playwright-cli` 的 `goto` 对 Metro dev server（`lazy=true` + 长连接）会挂起（`load` 事件不触发），多次尝试均超时。已改用静态产物 A/B + DOM 结构断言替代，结论不受影响。

## 产物与访问

- `apps/mobile/dist-v25`（含本次修复）→ **http://127.0.0.1:4185**
- `apps/mobile/dist-v24`（对照组，修复前）→ `http://127.0.0.1:4187`（仅用于 A/B，可关闭）
- dev server：`http://127.0.0.1:8081`
- Web 预览：`http://127.0.0.1:4186`

## 新增可复用探针

- `screenshots/mobile/count-nested-buttons.js` —— 统计 `document.querySelectorAll('button button')`，**在任意构建（含生产）中直接观测 DOM 嵌套**，是验证此类缺陷最可靠的手段（不受 dev-only 告警影响）。
