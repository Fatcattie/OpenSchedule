# QA 报告 · 增量 12 多语言 —— 核心机制独立验证

> 验证人：主理人（fresh eyes，不复用实现者自证）
> 日期：2026-10-07
> 被测提交：`3d3c2d7` `41f2d39` `f45fe00` `7728c6b` `95c7c33` `fdc7169` `a120467` `13f2622` `8e405f5`
> 结论：**IS_PASS: YES** · **阻断项：0** · 潜在缺口 (g)：**0**（2 处已修）

---

## ① 三态解析矩阵（`src/i18n/systemLocale.ts` 的 `resolveSystemLocale()`）

**方法**：临时探针 `tests/__probe-i18n-matrix.test.tsx`（`jest.mock('expo-localization', …)` 固定设备语言），验证后已删除。

**实测输出**：

```
PASS tests/__probe-i18n-matrix.test.tsx
Tests: 15 passed, 15 total
```

| 设备语言输入 | 期望 | 实测 |
| --- | --- | --- |
| `{languageTag:'zh-CN'}` | `zh-CN` | ✅ |
| `{languageTag:'zh-TW'}` | `zh-CN` | ✅ |
| `{languageTag:'zh-Hans-CN'}` | `zh-CN` | ✅ |
| `{languageTag:'zh'}` | `zh-CN` | ✅ |
| `{languageTag:'en-US'}` | `en-US` | ✅ |
| `{languageTag:'en-GB'}` | `en-US` | ✅ |
| `{languageTag:'ja-JP'}` | `en-US` | ✅ |
| `{languageTag:'fr-FR'}` | `en-US` | ✅ |
| `{languageTag:''}`（空串） | `zh-CN` | ✅ |
| `[]`（空数组） | `zh-CN` | ✅ |
| `[{}]`（无字段） | `zh-CN` | ✅ |
| `{languageCode:'zh'}`（仅 languageCode） | `zh-CN` | ✅ |
| `{languageCode:'ja'}` | `en-US` | ✅ |
| `getLocales()` **抛错** | `zh-CN` 且 `not.toThrow()` | ✅ |
| `getLocales()` 返回空 | `zh-CN` | ✅ |

⇒ **三级兜底成立**：`zh*` → 中文；其余一切 → 英文；探测异常 / 空 → 中文，**永不抛错**。

---

## ② 默认路径零加载 `expo-localization`（正反对照计数）

**方法**：临时探针 `tests/__probe-i18n-lazyload.test.tsx`。在 `jest.mock` 工厂体内对 `loadCount` 计数（工厂仅在执行 `require('expo-localization')` 时运行），**顺序敏感**（模块缓存使计数只增一次）。验证后已删除。

**实测输出**：

```
PASS tests/__probe-i18n-lazyload.test.tsx
  √ ① 默认偏好（zh-CN）渲染 ⇒ expo-localization 加载次数 = 0
  √ ② 切到 system ⇒ 加载次数 = 1，且按设备语言解析为 en-US
Tests: 2 passed, 2 total
```

| 场景 | `loadCount` | 结论 |
| --- | --- | --- |
| 渲染 `<I18nProvider>`（默认偏好 `zh-CN`）+ **flush hydrate 的异步 effect** | **0** | 默认路径**零加载**、零副作用 ✅ |
| 再 `setPreference('system')` | **1**（`preference='system'`、`locale='en-US'`） | 仅 `'system'` 才加载 ⇒ 正反对照成立 ✅ |

**踩坑记录（可复用）**：`create()` 必须包在 `await act(async () => { … })` 内。若用**同步** `act`，hydrate 的 `setIsReady(true)` 会落在 act 外（React 会打印 `An update to I18nProvider inside a test was not wrapped in act(...)`），后续 act 内的 state 更新被卡住 ⇒ `setPreference('system')` 看似"不生效"（实测 `preference` 仍为 `zh-CN`）。这是**探针写法问题，非产品缺陷**。

---

## ③ 无 Provider 兜底

既有 `tests/i18n-provider.test.tsx` 用例 ⑥ 覆盖：不包裹 `I18nProvider` 直接渲染调用 `useI18n()` / `useT()` 的探针 ⇒ `locale === 'zh-CN'`、`t('common.confirm') === '确认'`、**不抛错**。

必要性：全仓有 **31 个渲染套件不包 Provider**（`grep -rl "TestRenderer.create\|render(" apps/mobile/tests | wc -l` ⇒ 31）。故 `useI18n()` **必须**无 Provider 时回退 `FALLBACK_I18N` 而非抛错。

---

## ④ zh 输出逐字节不变（零回归）

1. **最强证据**：`8e405f5` 把 `ConnectivityProvider.tsx:154` 的硬编码 `message="网络已恢复，已刷新"` 改为 `t('component.refreshToast.message')` 后，`tests/offline-provider.test.tsx:246` 的断言
   `expect(toasts[0].props.message).toBe('网络已恢复，已刷新')` **仍绿** ⇒ 改走 `t()` 后 zh 输出**零字节差异**。
2. **全量回归**：`npx jest --config jest.config.js` ⇒ **58 套件 / 1013 用例全绿**（142s）；`npx tsc --noEmit` ⇒ **0 错误**。既有 55 套件 / 966 用例**无一个被改动**。
3. **冻结常量未动**：`src/theme/semantic.ts` 的 `lightStatusColor` / `darkStatusColor`（含中文 label）与增量前逐行一致（`theme-contrast.test.ts` 深比较 + 对象同一性断言绿）。

---

## ⑤ 全 `src/` 残留中文审计

脚本按 6 类归类 `apps/mobile/src/**/*.{ts,tsx}` 中含中文的行：

```
(a) 字典              783 行
(b) 冻结常量 / 取数    672 行
(c) 注释             2048 行
(d) mock 种子数据      259 行
(g) ★待判定★           31 行
```

**(g) 31 行逐条判定** ⇒ 发现 **2 处真缺口**（实现者与浏览器 E2E 双方均漏），**已修并提交 `8e405f5`**：

| 缺口 | 位置 | 问题 | 处置 |
| --- | --- | --- | --- |
| G1 | `src/hooks/useAuth.ts:73` | 登录页错误提示「生物识别未通过，请改用密码登录」硬编码 | 新增键 `auth.biometricFailed`，改 `t()` |
| G2 | `src/store/ConnectivityProvider.tsx:154` | 硬编码 `message="网络已恢复，已刷新"`，**绕过了 `RefreshToast` 已接入的 i18n** | 改 `message={t('component.refreshToast.message')}`（保留 prop，兼容既有断言） |

**其余 29 行判定为合法**（勿误判为缺口）：

- 行内注释（`systemLocale.ts:38,39,41`、`focus.service.ts:458`、`TaskDetailScreen.tsx:507`）
- `console.warn` 中文日志（`services/platform/attachmentPicker*.ts` ×4）
- 开发者 `throw new Error('useXxx 必须在 <XxxProvider> 内部使用')`（`AppProvider.tsx:340`、`ConnectivityProvider.tsx:166`）
- **硬边界 F10**：`MainTabs.tsx:40-44` 的 5 个中文 Tab —— `tests/increment-ui-polish.test.tsx:358-365` 对**源码文本**断言，必须原样保留；旁有 `TAB_LABEL_EN` 按 `locale` 选表 ✅ 非缺口
- 已登记允许：`AttachmentUploadSheet` mock 文件名 ×6、`ProfileScreen:53` 语言自名「中文」、`TaskDetailScreen:184` / `TodayFocusScreen:299,358` reason 数据串、`WorkspaceScreen:556-557` L8 日期格式

⇒ **修复后潜在缺口 (g) = 0**。

---

## ⑥ 键集合对称性（独立复核）

逐域提取键名后 `sort + diff`（不依赖实现者自证）：

```
common:       IDENTICAL
domain:       IDENTICAL
nav:          IDENTICAL
ui:           IDENTICAL
screens.core: IDENTICAL
screens.more: IDENTICAL
business:     IDENTICAL
services:     IDENTICAL
合计 645 键
```

且 `en` 声明为 `Record<TranslationKey, string>`（`TranslationKey = keyof typeof zh`）⇒ **漏键 / 多键均为编译错误**，由类型系统在 CI 兜底。

---

### ⑦ `probeEpoch`：AppState 回前台重探测（唯一此前未验证的代码路径）

**方法**：临时探针 `tests/__probe-i18n-epoch.test.tsx`，`jest.spyOn(AppState, 'addEventListener')` 捕获监听、`jest.mock('expo-localization', …)` 固定设备语言；验证后已删除。

**实测输出**：

```
PASS tests/__probe-i18n-epoch.test.tsx
Tests: 5 passed, 5 total
```

| 场景 | 断言 | 结论 |
| --- | --- | --- |
| 偏好 ≠ system（默认 zh-CN） | `addEventListener` 调用 **0** 次 | ✅ 默认路径零订阅（与 ② 零加载一致） |
| 切到 system | `addEventListener` 调用 **1** 次，`locale='en-US'` | ✅ 仅 system 注册 |
| 设备语言改 `zh-CN` 后触发 `active` | `locale` 从 `en-US` → `zh-CN` | ✅ 回前台重探测生效 |
| 触发 `background`（非 active） | `locale` 保持 `en-US` | ✅ 仅 active 触发，避免无效重算 |
| 卸载 | `subscription.remove()` 被调用 | ✅ 无监听泄漏 |

⇒ `probeEpoch` 自增 → `locale` `useMemo` 重算（`I18nProvider.tsx:147-151`）链路完整、正确；此前浏览器 E2E 报告里"随系统切换"已覆盖冷启动路径，本项补齐**运行时回前台**路径。

---

## 结论

| 项 | 结论 |
| --- | --- |
| 三态解析矩阵 | ✅ 15/15 |
| 默认路径零加载 | ✅ 正反对照成立（0 vs 1） |
| 无 Provider 兜底 | ✅ 既有单测覆盖 |
| zh 逐字节不变 | ✅ 58 套件 / 1013 用例全绿 |
| 全 `src/` 残留审计 | ✅ 潜在缺口 0（2 处已修） |
| 键集合对称 | ✅ 8 域逐域 IDENTICAL，645 键 |
| `probeEpoch` 回前台重探测 | ✅ 5/5 |

**IS_PASS: YES** · **阻断项：0**

### 未能覆盖 / 存疑

1. **真机原生能力**：`expo-localization` 在真机（iOS/Android）的实际返回值形状、以及原生手势 / 生物识别 / 首屏性能未实测 —— 本验证基于 mock 的 `getLocales()` 契约（Web 实测已通过，见 E2E 报告）；原生能力沿用 `DELIVERY-mobile.md` 已知限制 #6，需真机 Expo Go 扫码。
2. **服务端文案**：跨包，需 `Accept-Language`，本期明确不做（PRD §6-D13 已明示为允许残留）。
