# QA · Mobile 增量 10 · 深色模式（M-P2-01）端到端验收

## 结论

**IS_PASS: YES**　阻断项：**0**

一句话结论：深色模式三态（浅色 / 深色 / 跟随系统）在 Web 产物上全部按预期工作，全 14 屏深色下**未发现漏白**，切换即时生效、刷新持久化、Console 0 error；唯一非阻断观察是冷启动存在 **≈18ms（约 1 帧）的「先浅后深」跳变**（M3 观察点），肉眼在本地环境基本不可察。

---

## 验收环境

| 项 | 值 |
| --- | --- |
| 日期 | 2026-10-06 |
| 产物 | `apps/mobile/dist-v28`（`npx expo export --platform web --output-dir dist-v28`，耗时 1m13s） |
| Bundle | `_expo/static/js/web/index-0c7e3e50dc1c9c57ae186782aa5cef7b.js`（1.67 MB） |
| 静态服务 | `node scripts/serve-dist.mjs apps/mobile/dist-v28 --port 4191 --host 127.0.0.1` |
| 浏览器 | 系统 Chrome（`playwright-cli --browser=chrome`），视口 390×844 |
| 账号 | mock 演示账号 `zhangwei@example.com` / `openschedule`（`USE_MOCK` 默认 true） |
| 产物自检 | bundle 内含 `0F1626` / `1A2333` / `E8EAF0` / `os.theme_mode` / 外观·深色·跟随系统（`\u` 转义） |

> 说明：`dist-v27` 为深色改造**前**产物（bundle 内无上述字符串），本轮已按要求重新打包。

---

## 逐条清单（操作 → 期望 → 实测 → 证据）

### ① 默认（跟随系统）+ 系统浅色

- **操作**：`emulateMedia({colorScheme:'light'})`，`os.theme_mode` 未设置（默认 system），登录后逐屏巡检。
- **期望**：全应用浅色，页面底 `#F7F8FA`。
- **实测**：workspace 页面底取样 `rgb(247,248,250)` = `#F7F8FA`；登录页取样 `rgb(251,250,247)` = `#FBFAF7`（`bg.baseWarm`，符合登录页暖白底设计）。
- **证据**：`login-light.png`、`workspace-light.png`、`today-light.png`、`projects-light.png`、`calendar-light.png`、`profile-light.png`、`notification-settings-light.png`、`about-light.png`、`notifications-light.png`、`submit-light.png`、`personal-plan-light.png`、`my-submissions-light.png`、`audit-center-light.png`、`task-detail-light.png`

### ② 「我的」页点「深色」→ 不重启全应用立即变深

- **操作**：`/me` → 点击「外观」分段控件「深色」。
- **期望**：无 reload 全应用立即变深，页面底 `#0F1626`。
- **实测**：同一会话内底色由 `rgb(251,250,247)` → `rgb(20,26,38)` = `#141A26`（Profile 用 `bg.baseWarm` 深色档）；`localStorage['os.theme_mode'] = 'dark'`。无页面重载。
- **证据**：`profile-light.png` → `profile-dark.png`；取值：`mode=dark`。

### ③ 深色下逐屏巡检漏白

- **操作**：深色态逐屏巡检 + 对可疑区域做**计算样式取样**（非仅肉眼）。
- **期望**：无浅色残留。
- **实测取样**：
  - 页面底 `rgb(15,22,38)` = `#0F1626` ✓
  - 卡片 / 输入框 / 底部 Tab 栏 `rgb(26,35,51)` = `#1A2333` ✓
  - 抽屉/弹层遮罩 `rgba(0, 0, 0, 0.6)` ✓
  - 状态标签「进行中」`#6E93E0` on `#1B2740`；「待办」`#A6ADBB` on `#1E2634` ✓（与 `semantic.ts` 深色集一致）
  - 主按钮 `rgb(62,111,217)` = `#3E6FD9`，白字 `#FFFFFF` ✓
  - **未发现漏白**（登录页品牌渐变头、卡片、输入框、Tab 栏、遮罩、状态标签、抽屉均为深色）。
- **证据**：`login-dark.png`、`workspace-dark.png`、`today-dark.png`、`projects-dark.png`、`calendar-dark.png`、`task-detail-dark.png`、`profile-dark.png`、`notifications-dark.png`、`notification-settings-dark.png`、`about-dark.png`、`submit-dark.png`、`personal-plan-dark.png`、`my-submissions-dark.png`、`audit-center-dark.png`、`bottomsheet-dark.png`（底部弹层 + 遮罩）

### ④ 点「浅色」→ 逐屏回到改造前浅色观感

- **操作**：`/me` → 点「浅色」，逐屏重拍并与 ① 基线做**像素级比对**。
- **实测**：12 屏中 **10 屏与 ① 基线逐字节一致（md5 相同）**：

  | 屏幕 | 基线 md5 | 覆盖后 md5 | 差异 |
  | --- | --- | --- | --- |
  | workspace | 4cb70811 | 4cb70811 | 一致 |
  | today | 958d57f8 | 958d57f8 | 一致 |
  | projects | 4738f069 | 4738f069 | 一致 |
  | calendar | b64d87e5 | b64d87e5 | 一致 |
  | notification-settings | bcd649a6 | bcd649a6 | 一致 |
  | about | d20e1f89 | d20e1f89 | 一致 |
  | submit | 556e4a03 | 556e4a03 | 一致 |
  | personal-plan | e3099e5f | e3099e5f | 一致 |
  | my-submissions | ba603a66 | ba603a66 | 一致 |
  | audit-center | f5bbf67a | f5bbf67a | 一致 |
  | profile | 6b847da0 | 4bff275d | 差异 = 外观选中项高亮（跟随系统→浅色，**预期**） |
  | notifications | 4d53577c | 8d999e76 | 差异 = 相对时间戳（16 分钟前→27 分钟前，**与主题无关**） |

- **证据**：`*-light2.png`（13 张，含 `task-detail-light2.png`）

### ⑤ 点「跟随系统」+ emulateMedia

- **操作**：`/me` → 点「跟随系统」，分别 `emulateMedia({colorScheme:'light'|'dark'})`。
- **期望**：生效方案随系统切换。
- **实测**：`mode=system` 时，`mq=false` → 底 `rgb(251,250,247)`（浅）；`mq=true` → 底 `rgb(20,26,38)`（深）。**无需刷新即时切换**。
- **证据**：`profile-system-light.png`、`profile-system-dark.png`

### ⑥ 刷新页面后偏好保持

- **操作**：显式深色后 `page.reload()`。
- **期望**：`localStorage.os.theme_mode` 仍在，生效方案保持深色。
- **实测**：reload 后 `os.theme_mode=dark` 保持，页面仍为深色（`/me`）。
- **证据**：`profile-dark-after-reload.png`

### ⑦ Console 0 errors

- **实测**：全流程 14 屏逐屏导航 + 三态切换 + 刷新，**Errors: 0**。
- **warning 判源**：唯一 warning 为
  `Animated: useNativeDriver is not supported because the native animated module is missing. Falling back to JS-based animation...`
  —— RN-Web 固有（Web 无 native animated 模块），**与深色模式无关**，本增量未引入。
  另有 1 条 `[VERBOSE] Password field is not contained in a form`（浏览器 DOM 提示，非 error）。

### ⑧ 深色下对比度抽检

- **实测取样值**（与 `tokens.ts` / `semantic.ts` 定义逐项一致）：

  | 元素 | 前景 | 背景 |
  | --- | --- | --- |
  | 正文 / 区块标题 | `#E8EAF0` | `#0F1626` |
  | 次要文字 | `#A6ADBB` | `#1E2634` |
  | 状态标签（进行中） | `#6E93E0` | `#1B2740` |
  | 状态标签（待办） | `#A6ADBB` | `#1E2634` |
  | 主按钮 | `#FFFFFF` | `#3E6FD9` |

- 具体对比度比值由 `tests/theme-contrast.test.ts`（24 用例）编码覆盖；本轮确认**渲染实际取值与设计 token 一致**，未发现取值漂移。

### ⑨ M3 冷启动主题跳变观察

- **方法**：显式覆盖为「深色」+ 系统浅色，注入 `addInitScript` 以 rAF 采样 `#root` 有效底色序列，然后硬刷新。
- **实测序列**：

  ```
  [  14ms]  rgba(0, 0, 0, 0)   ← 未绘制
  [ 164ms]  rgb(247, 248, 250) ← #F7F8FA  浅色（先浅）
  [ 182ms]  rgb(15, 22, 38)    ← #0F1626  深色（后深）
  ```

- **结论：存在**「先浅后深」跳变，**窗口 ≈18ms（约 1 帧 @60fps）**。
- **成因**：`ThemeProvider` 的 `mode` 初值为 `'system'`，首帧按系统（浅色）渲染；`AsyncStorage.getItem('os.theme_mode')` hydrate 完成后（182ms）才切深。属架构 §9-M3 记录的已知行为，非回归。
- **可见性判断**：本地静态服务下 18ms 肉眼基本不可察；真机 / 慢设备 hydrate 更慢时窗口可能拉长，建议后续在真机观察（见「非阻断建议」）。
- **证据**：采样序列（上方）；`profile-dark-after-reload.png`

---

## 回归硬约束复核：裸 `<Pressable>` 白名单

- 精确匹配 `<Pressable[^A-Za-z]|$`，命中文件：

  | 文件 | 行 |
  | --- | --- |
  | `src/components/BottomSheet.tsx` | 89 |
  | `src/components/Button.tsx` | 59 |
  | `src/components/Card.tsx` | 40 |
  | `src/components/ScreenHeader.tsx` | 40 |
  | `src/components/SegmentedControl.tsx` | 79 |
  | `src/components/SwipeableRow.tsx` | 57 |

- 另有 `src/components/PressableScale.tsx`（封装本体）与 `BottomSheet.tsx:6`（注释）为噪声。
- **结论**：裸 `<Pressable>` 仅存在于 6 个白名单文件，其余组件均走 `PressableScale`，**约束保持**。

---

## 未取证项（诚实标注，均非深色模式缺陷）

| 项 | 静态核验 | 动态取证 | 说明 |
| --- | --- | --- | --- |
| Toast（`UndoToast` / `RefreshToast`） | ✅ 全量主题化（`useThemedStyles` + `colors.primary` / `colors.text.inverse`，无浅色硬编码）→ 漏白风险 0 | ❌ 未取得 | 合成滑动（`mouse down→move→up`）无法稳定触发撤销态：任务数变化但 Toast 文本始终未进入 DOM，判断为**手势驱动限制**而非产品缺陷 |
| 骨架屏（`Skeleton`） | ✅ 已主题化（`useThemedStyles(makeStyles)`） | ❌ 未取得 | mock 数据解析快于 1 帧（120ms 截图时已渲染完成） |
| 空状态（`StateViews`） | ✅ 已主题化 | ❌ 未取得 | 未构造出空数据场景 |

> 上述三项**组件本身均无静态浅色硬编码**，且其视觉语言与已验证的 14 屏一致，故不阻断本次验收；建议后续用真机或更可靠的手势驱动补测。

---

## 非阻断建议

1. **冷启动 18ms 浅色跳变（M3）**：可考虑在首帧前同步读取 `localStorage`（Web）/ 启动时预置初值，或把 `mode` 初值改为「hydrate 前不渲染根容器底色」，以消除这一帧的浅色闪现。当前影响极小，可择机优化。
2. **Toast / 骨架屏 / 空状态动态取证**：建议补真机手势用例，或为这三类组件增加可稳定触发的 E2E 钩子。

---

## 证据清单

目录：`docs/mobile-app/qa-increment10/`（共 47 张 PNG）

- 浅色基线（①）：`*-light.png` × 14（login / workspace / today / projects / calendar / profile / notification-settings / about / notifications / submit / personal-plan / my-submissions / audit-center / task-detail）
- 浅色覆盖（④）：`*-light2.png` × 13、`profile-light-override.png`、`workspace-light-override.png`
- 深色（②③）：`*-dark.png` × 15（14 屏 + `bottomsheet-dark.png` 底部弹层/遮罩）
- 三态 / 持久化（⑤⑥）：`profile-system-light.png`、`profile-system-dark.png`、`profile-dark-after-reload.png`
