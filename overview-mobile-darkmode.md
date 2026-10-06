# 移动端增量 10 · 深色模式（M-P2-01）交付概览

> 团队 `software-mobile-darkmode`（产品经理许清楚 → 架构师高见远 → 工程师寇豆码 ×3 → QA 严过关），主理人齐活林编排
> 需求来源：`docs/mobile-app/PRD-mobile.md` M-P2-01（P2）
> 交付日期：2026-10-06

## 一、做了什么

给 `apps/mobile` 加上**深色模式**，模式范围与配色由用户拍板：

| 决策点 | 用户选择 |
| --- | --- |
| 模式范围 | **跟随系统 + 手动覆盖**（三态：浅色 / 深色 / 跟随系统） |
| 配色方向 | **商务风深色版**（深墨蓝基底近黑，非纯黑；单值主色双角色） |

用户可在「我的」页新增的**「外观」区块**（`SegmentedControl` 三态）随时切换，**切换即时全应用生效、无需重启**；偏好持久化于 AsyncStorage 键 `os.theme_mode`。

## 二、核心问题与解法（本次最有价值的部分）

**根因**：`colors` 原本是 `src/theme/tokens.ts` 里**模块加载期求值的静态常量**，而全仓 **558 处 `colors.`（分布在 46 个 `src/` 文件）全部位于模块级 `StyleSheet.create({...})`**。RN 的 `StyleSheet.create` 近似恒等函数 ⇒ **样式值在模块加载时就固化了，运行时改 `colors` 对象不会触发任何重绘**。所以「加一套深色 token」本身完全不起作用。

**解法**：引入**样式工厂 + hook**，把样式求值从「模块加载期」推迟到「渲染期」：

```ts
// 模块级常量工厂（参数名必须叫 colors —— 有源码扫描断言依赖该字面串）
const makeStyles = (colors: ThemeColors) => StyleSheet.create({ ... })

export function Card() {
  const styles = useThemedStyles(makeStyles)   // 内部 useMemo([factory, colors])
}
```

配套改造面：46 个文件（8 个只需工厂 / 36 个需组件内取色 / 13 个非 StyleSheet 的模块级求值点位）、16 个屏幕、24 个组件、导航层 3 个文件、`app.json` 的 `userInterfaceStyle` → `"automatic"`。

## 三、交付物

**源码（`apps/mobile`）**
- `src/theme/tokens.ts` —— `lightColors`（逐字节冻结）/ `darkColors` / `ThemeColors` 类型 / `colors = lightColors` 兼容导出
- `src/theme/semantic.ts` —— 状态标签 6 色 + 优先级 4 色各双套；`get*For(…, map)` 运行时取色（保留 1 参旧签名兼容）
- `src/store/ThemeProvider.tsx` —— 主题运行时（三态解析 / hydrate / 持久化 / 无 Provider 回退浅色）
- `src/services/config.ts` —— `PREFERENCE_KEYS.themeMode = 'os.theme_mode'`
- `src/screens/ProfileScreen.tsx` —— 「外观」三态开关
- `src/hooks/index.ts` —— 主题再导出已删除，**主题 API 唯一入口 = `@/store/ThemeProvider`**

**测试（`apps/mobile/tests`）**
- `theme-contrast.test.ts`（24 用例）—— 自实现 WCAG 2.1 对比度；深色达标 + 浅色冻结 + 浅色 8 处既有偏差登记
- `theme-runtime.test.tsx`（16 用例）—— 三态解析 / 跟随系统→深色 / 覆盖态不响应系统 / hydrate / 持久化 / memo / 无 Provider 兜底

**文档（`docs/mobile-app`）**
- `PRD-mobile-increment-10-darkmode.md`（424 行）
- `ARCH-mobile-increment-10-darkmode.md`（961 行，含附录 A 色值+对比度、附录 B 浅色偏差）
- `ARCH-mobile.md`（§3 主题分层、色彩/状态/优先级表加深色列、§10 主题边界）
- `QA-mobile-increment-10-darkmode.md` + `qa-increment10/`（47 张截图）

## 四、验证结论

| 项 | 结果 |
| --- | --- |
| `tsc --noEmit` | **EXIT 0** |
| 全量 jest | **52 套件 / 924 用例全绿**（106.1s；基线 50/884） |
| 新测试变异验证 | M1 深色低对比 / M2 浅色改 1 hex 位 / M3 跟随系统失效 → **三条断言分别精准打红**（非空转绿灯） |
| 静态取色残留 | **0**（判据：`StyleSheet.create` 所在行不带 `=>` 即未工厂化） |
| 从 `@/hooks` 误取主题 hooks | **0 个文件**（48 个文件走正确路径） |
| 附录 A 对比度表 | **20 行逐行独立验算，0 处不一致** |
| 端到端（Web 产物 `dist-v28`） | **IS_PASS: YES / 阻断 0**；14 屏深色**未发现漏白**；三态切换即时生效；刷新后偏好保持；**Console 0 errors** |
| 回归硬约束 | 裸 `<Pressable>` 仍**恰好 6 个白名单文件** |
| 浅色零回归 | 12 屏中 10 屏与改造前基线**像素级 md5 逐字节一致**（另 2 屏差异各有明确非主题成因） |

## 五、关键裁决

1. **浅色 palette 的 8 处既有对比度偏差不修复**，D6 阈值**仅对深色方案验收**。理由：浅色色值本身不达标属既有问题，若强行修复会同时破坏「浅色零回归」与「不修改既有断言」两条硬约束 ⇒ 登记为 `§9-M1`，建议另开增量。
2. **`cancelled`（已取消）状态标签按 ≥3:1 验收**（实测 3.93:1）。理由：属去强调/禁用态文字，WCAG 2.1 对非活动组件不作 4.5:1 正文要求。文档原汇总表写「6 状态全部 ≥4.5 / 6.55~7.00」与附录 A.2 自相矛盾，已订正。
3. **冷启动 18ms 浅色闪现接受，不加 `isReady` 门禁**（`§9-M3` 闭环）。理由：≈1 帧、肉眼基本不可察；加门禁会给每次冷启动引入首帧空白延迟；「hydrate 前不渲染底色」在 Web 会露 HTML body 白底、可能更糟；彻底消除需 `expo-splash-screen` ⇒ 违反零新增依赖。
4. **`ARCH-mobile.md` §3.3–§3.6 的 radius/motion/spacing/shadow 漂移不同步**（`§9-M9`）：属「设计语言升级线」既有技术债，与深色无关。

## 六、过程中踩到并固化的坑

1. **🔴 跨任务阻断（最严重）**：全仓**恰好 14 个**测试套件用**工厂式** `jest.mock('@/hooks', () => ({ useAuth, useAsync, … }))` **整体替换**该桶（工厂内无主题 hooks），且**直接渲染屏/组件、不包 `<ThemeProvider>`**。⇒ 新增「全局 hook」时，**唯一入口必须避开被整体 mock 的模块**。主题 hooks 只能走 `@/store/ThemeProvider`；同时 `useTheme()` 必须**无 Provider 时回退浅色**而非抛错。
2. jest 环境下 `Appearance.addEventListener` = `undefined` ⇒ **禁止手写订阅**，只能用 `useColorScheme()`。
3. `useColorScheme()` 返回类型含 `'unspecified'` ⇒ `?? 'light'` 会 **TS2322**，须用 `=== 'dark' ? 'dark' : 'light'`。
4. jest 中整体 mock `react-native` 会崩（`{ ...requireActual }` 展开触发 DevMenu TurboModule 不变式）⇒ 须**定向 mock** `react-native/Libraries/Utilities/useColorScheme`。
5. **汇总表与明细表必须交叉验算**：D6 汇总表与附录 A.2 的矛盾若不发现，测试就会照错表编码。
6. 主理人自己的检测脚本曾**三次误报**（文件级 vs 同一 import 行、块级 vs 工厂形参）——最终正确判据是「`StyleSheet.create` 所在行**不带 `=>`**」。

## 七、遗留（非阻断）

1. **未动态取证的三类组件**：Toast（`UndoToast`/`RefreshToast`）、骨架屏（`Skeleton`）、空状态（`StateViews`）—— 三者**均无静态浅色硬编码**（已全量 `useThemedStyles`），但 Web 端手势/时序限制未能稳定捕获动态截图。建议补真机用例。
2. **Web 端 `userInterfaceStyle: "automatic"` 不注入导出 `index.html`**（无 `color-scheme` meta）⇒ Web 深色纯靠 `matchMedia` + `localStorage`；**原生真机行为 Web 覆盖不到**。
3. **真机验收盲区**（沿用 `DELIVERY-mobile.md` 已知限制 #6）：真机手势、原生生物识别、首屏性能，以及本次新增的**冷启动跳变在慢设备上的实际窗口**。
4. `dist-v22..v28` 产物待清理。
5. 可选优化：冷启动浅色闪现可评估「Web 端同步预读 `localStorage` 初值」。
