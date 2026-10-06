# 缺陷修复交付概览 — 返回按钮（个人计划页 + 根栈深链）

- **项目**：OpenSchedule 移动端（`apps/mobile`，Expo / React Native）
- **类型**：🔧 BugFix 快捷路径（工程师定位修复 → QA 回归验证）
- **日期**：2026-09-28
- **状态**：✅ 已完成（静态检查 / 单元测试 / 浏览器 E2E 三层验证通过）

---

## 1. TL;DR

用户报告的「个人计划页缺少返回按钮」已修复；在验证过程中**额外发现并修复**了一个更严重的同源缺陷 —— **冷启动深链直达根栈页面时，返回按钮是"死键"**（点击无反应且底部 TabBar 被全屏覆盖，用户被困）。现已在 6 个根栈页面、11 个返回调用点统一改为「能返回就返回，否则回工作台」的安全兜底。

---

## 2. 缺陷一：个人计划页缺少返回按钮（用户报告）

### 根因
`PersonalPlan` 挂在 **根共享栈 `MainRootStack`**（全屏、盖住 TabBar），但它的 `ScreenHeader` 没有传 `onBack` 属性。而 `ScreenHeader` 的契约是 —— **只有传了 `onBack` 才渲染返回箭头**（`accessibilityLabel="返回"`，Feather `chevron-left` = U+F12F）。于是该页成了"无出口页面"。

### 全量审计（证明这是唯一遗漏）
对全部页面做了返回能力清点：

| 分类 | 页面 | 结论 |
|------|------|------|
| 根栈 / 非初始路由（应有返回） | TaskDetail×4、Notifications、Submission×2、CreateItem×2、**PersonalPlan**、MySubmissions、NotificationSettings、About、Board | 除 PersonalPlan 外均已具备 → 已补齐 |
| Tab 初始路由（不应有返回） | Workspace、TodayFocus、Calendar、Profile、ProjectList | 正确，无需返回 |

**审计结论**：`PersonalPlan` 是唯一的遗漏点。

### 修复
`apps/mobile/src/screens/PersonalPlanScreen.tsx`：

```tsx
<ScreenHeader
  title="个人计划"
  subtitle={ personalTasks.data ? `共 ${personalTasks.data.length} 项个人任务` : undefined }
  onBack={() => goBackOrHome(navigation)}
/>
```

---

## 3. 缺陷二：冷启动深链下返回按钮失效（验证时发现）

### 现象
通过深链（地址栏直开 `/personal-plan` 或通知跳转 `/task/task-005`）冷启动进入页面后，点击左上角返回箭头**没有任何反应**，而该页全屏覆盖了 TabBar —— 用户被困在页面里。

### 根因
`getStateFromPath('/personal-plan')` 解析出的导航栈**只有 `PersonalPlan` 这一层**，栈底没有 `Tabs`。
- 运行时探针证实：`hasTabBar === false`；
- 源码证据：`tests/linking.test.ts` 的 CASES 中 `/personal-plan` 的链路就是 `PersonalPlan` 单层。

因此 `navigation.goBack()` 在"栈底无下层路由"时是 **no-op（静默失败）**，而 TabBar 又被全屏页面盖住 → 无任何退出路径。
**影响范围**：全部 6 个根栈页面。

### 被证伪的错误方案（重要）
我最初怀疑是 `linking.config` 缺 `initialRouteName: 'Tabs'`。用一次性探针测试验证后发现：加上它会让**全部 6 个根深链退化成只有 `Tabs`**（目标页面根本打不开）—— 比原缺陷更糟。**已放弃该方案**，避免了一次严重回归。

### 正确修复：`goBackOrHome` 兜底
新增 `apps/mobile/src/utils/navigation.ts`（纯函数，不依赖 React）：

```ts
export const ROOT_FALLBACK_ROUTE = 'Tabs' as const
export type BackCapableNavigation = Pick<AppNavigationProp, 'canGoBack' | 'goBack' | 'navigate'>

export function goBackOrHome(navigation: BackCapableNavigation): void {
  if (navigation.canGoBack()) { navigation.goBack(); return }
  navigation.navigate(ROOT_FALLBACK_ROUTE)
}
```

即：**只在"无路可退"这一种状态下改变行为**，正常返回链路完全不变。

### 改动范围

| 文件 | 调用点 | 说明 |
|------|--------|------|
| `TaskDetailScreen.tsx` | 4 | 根栈页面 |
| `NotificationsScreen.tsx` | 1 | 根栈页面 |
| `SubmissionScreen.tsx` | 2 | 根栈页面 |
| `CreateItemScreen.tsx` | 2 | 根栈页面 |
| `PersonalPlanScreen.tsx` | 1 | 根栈页面 |
| `MySubmissionsScreen.tsx` | 1 | 根栈页面 |
| **合计** | **11** | |

**刻意不改（3 处）**：`AboutScreen.tsx:38`、`BoardScreen.tsx:143`、`NotificationSettingsScreen.tsx:71` —— 它们位于 **Tab 内嵌栈**，深链时 `Tabs` 必然在栈底（如 `/me/about` → `Tabs > Me > About`），不存在该缺陷。

---

## 4. 验证结果

| 层级 | 项目 | 结果 |
|------|------|------|
| 静态 | `tsc --noEmit` | ✅ 退出码 0 |
| 单元/集成 | `jest` 全量 | ✅ **36 suites / 677 tests 全绿**（基线 668 + 新增 9） |
| 浏览器 E2E | 冷启动深链 `/personal-plan` → 登录 → 点返回 | ✅ 成功退出到 `/workspace`（修复前为死键） |
| 浏览器 E2E | 冷启动深链 `/task/task-005` → 登录 → 点返回 | ✅ 退出到 `/workspace` |
| 浏览器 E2E | 回归：应用内 工作台 → 个人计划 → 返回 | ✅ 回到 `/workspace`，TabBar 正常存在 |
| 浏览器 E2E | 控制台报错 | ✅ **0 error** |
| 产物核验 | 打包产物中调用点 | ✅ 11 处 `onBack` 调用 `goBackOrHome`，3 处保留 `goBack`（Tab 内嵌栈） |

### 新增回归测试
`apps/mobile/tests/bugfix-root-stack-back.test.tsx`（9 个用例）：
- (A) `goBackOrHome` 双分支纯函数行为 + `ROOT_FALLBACK_ROUTE === 'Tabs'`
- (B) `ScreenHeader` 渲染机制对照组（传/不传 `onBack`）
- (C) `PersonalPlanScreen` 渲染出返回按钮（**修复前此用例失败**）
- (D) 两种栈深度下的点击行为（`goBack` vs `navigate('Tabs')`）+ 标题/副标题契约

**测试有效性自证**：临时回退修复代码 → 确认 2 条断言转红 → 再恢复，证明测试确实覆盖了该缺陷。

---

## 5. 文件清单

**新增**
- `apps/mobile/src/utils/navigation.ts`
- `apps/mobile/tests/bugfix-root-stack-back.test.tsx`
- `screenshots/mobile/bugfix-01-personal-plan-back.png`（修复后截图）
- `.workbuddy-ai/memory/2026-09-28.md`（缺陷记录）
- `overview-mobile-bugfix-back.md`（本文件）

**修改**
- `apps/mobile/src/screens/PersonalPlanScreen.tsx`
- `apps/mobile/src/screens/TaskDetailScreen.tsx`
- `apps/mobile/src/screens/NotificationsScreen.tsx`
- `apps/mobile/src/screens/SubmissionScreen.tsx`
- `apps/mobile/src/screens/CreateItemScreen.tsx`
- `apps/mobile/src/screens/MySubmissionsScreen.tsx`

**删除**
- `apps/mobile/tests/bugfix-personal-plan-back.test.tsx`（已合并进新测试文件）

---

## 6. 用户下一步建议

1. **浏览器验收**：打开 `http://127.0.0.1:4180/`（最新构建 `dist-v10`）
   - 路径 A：工作台 → 个人计划 → 左上角返回箭头 → 应回到工作台
   - 路径 B（复现原缺陷）：地址栏直接访问 `http://127.0.0.1:4180/personal-plan` → 登录 → 点返回 → 应能退出（修复前无反应）
2. **历史版本对照**：4178 = 仅修返回按钮版本；4177 = 增量 5 版本
3. **已知遗留**（不影响本次验收）：5 处"操作后跳转"型 `goBack()` 在冷启动深链下仍为 no-op（`CreateItemScreen:160/175`、`SubmissionScreen:208/235`、`MySubmissionsScreen:128`），用户可通过已修复的页头返回键退出
4. **端口说明**：**4173 永久避用**（被另一项目 `Seeyou` 的 `vite preview --strictPort` 以 IPv6 独占），增量 1 预览已迁至 **4179**

---

## 7. 结论

两层缺陷均已修复并通过三层验证（静态 / 677 测试 / 浏览器 E2E）。
核心设计原则沉淀：**根栈页面与 Tab 内嵌栈页面的返回语义不同，根栈页面必须使用可兜底的返回逻辑**；该规则已写入 `expo-web-e2e-verify` 技能（步骤 5.6(g)/5.6(h)）以防复发。
