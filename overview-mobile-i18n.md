# 移动端增量 12 · 多语言（中/英）（M-P2-05）交付概览

> 需求来源：`docs/mobile-app/PRD-mobile.md:116` — `M-P2-05` 多语言（中/英），验收要点 **复用 `user.locale`**。
> 交付日期：2026-10-07 · 负责人：齐活林（主理人）· 团队：许清楚（PM）/ 高见远（架构师）/ 工程师 ×5 / QA ×2
> 设计文档：`docs/mobile-app/PRD-mobile-increment-12-i18n.md`（PRD v2.0）、`docs/mobile-app/ARCH-mobile-increment-12-i18n.md`（架构）

---

## 一、做了什么

**一句话**：为 OpenSchedule 移动端引入**轻量自研 i18n 运行时**，支持**三态语言**（中文 / English / **跟随系统**），**默认中文**，并**全量覆盖 L0–L7**（16 屏 + 全部业务组件 + 通用组件 + 导航层 + 服务/工具层提示）。

| 层 | 内容 | 状态 |
| --- | --- | --- |
| **L0** | i18n 基础设施：类型 / zh-en 字典 / `translate()` 纯函数 / `I18nProvider` / 持久化 / 无 Provider 兜底 / 设备语言探测适配层 | ✅ |
| **L1** | 「我的」页新增「语言」区块（`SegmentedControl` 三态，与「外观」同构并列） | ✅ |
| **L2** | 底部 5 Tab 标题 + 各 Stack 屏标题 | ✅ |
| **L3** | 通用组件层 + 全局提示层（离线横幅 / 缓存标记 / 两种 Toast） | ✅ |
| **L4** | 核心 8 屏（去重后 7 屏 + ProfileScreen 补译） | ✅ |
| **L5** | 其余 8 屏（日历 / 个人计划 / 通知 / 通知设置 / 我的提报 / 审核中心 / 提报 / 新建事项） | ✅ |
| **L6** | 业务组件（任务卡 / 项目卡 / 表单 / 评论项 / 审计项 / 时间轴 / 附件抽屉等） | ✅ |
| **L7** | 服务层 / 工具层用户可见提示（`ApiError` 文案 / HTTP 兜底 9 条 / 校验提示 / 权限提示等） | ✅ |
| **L8** | 日期 / 相对时间 / 字节 / 工时的 en 分支；复数；后端文案；RTL | ❌ **本期不做**（P2） |

**语言解析状态机**（三态）：冷启动 hydrate → 本地偏好 `os.locale`（`'zh-CN'`/`'en-US'`/`'system'`）→ 无本地偏好则读 `user.locale` seed（仅 `'en-US'` 认英文）→ 偏好为 `'system'` 时探测设备语言（`zh*`→中文，其余→英文，**探测异常/空→中文**）→ 落到 `Locale = 'zh-CN' | 'en-US'`。**`'system'` 只存在于偏好层，永不流入字典查找。**

---

## 二、核心问题与解法（本次最有价值的部分）

### N1｜回归可行性（最大风险）：既有 ≈216 处中文断言钉死中文输出
31 个测试文件直接断言中文渲染文本（如 `offline-banner.test.tsx:196` 断言 `'分钟前'`、`my-submissions-rework.test.tsx:136` 断言 6 个状态词、`screen-gate.test.tsx:83` 断言 `'无权限：当前角色不能创建事项'`），且**断言不可修改**。

**解法（三重）**：
1. **默认偏好 = `'zh-CN'`（不是 `'system'`）** ⇒ 默认路径**永不触碰 `expo-localization`**，216 处断言在任意设备语言 / 任意 CI 沙箱下稳定为中文；
2. **无 Provider 时回退 `FALLBACK_I18N`（`locale='zh-CN'`）而非抛错** —— 全仓 31 个渲染套件不包 Provider，抛错会让它们全红；
3. **zh 词条逐字节不变**（凡替换，zh 值必须等于原字面串）。
⇒ 结果：既有 966 用例在改造后**全部仍绿**。

### N2｜改造面极大且"碎"：1208 处中文字面量 / 87 个文件
**解法**：**字典按域拆分为 8 个文件**（`common` / `domain` / `nav` / `ui` / `screens.core` / `screens.more` / `business` / `services`），**每个域文件由唯一任务拥有** ⇒ 既防并行写冲突，又使任务可四路并行。

### N3｜状态中文词重复 4 处（漂移风险）
`lightStatusColor`(6) / `darkStatusColor`(6) / `BOARD_COLUMNS`(5) / `TASK_TRANSITION_ACTIONS`(8) 各写一遍同一批中文。
**解法**：zh 词条**同源派生**（`taskStatus.todo = lightStatusColor.todo.label`），方向**单向**（字典 ← 常量），消灭漂移。共 15 个集中式常量被派生（`priority` / `projectStatus` / `submissionStatus` / `submissionKind` / `aiProposalType` / `notificationEvent` / `dependencyType` / `auditAction` / `approvalStatus` / `auditOpinion` / `reviewAction` 等）。

### N4｜架构留白：非 React 模块（service / util）如何取词
`HTTP_DEFAULT_MESSAGE` 位于 HTTP 客户端内部，**没有调用方可以传 `t`**；若改服务函数签名，会与并行的屏幕层任务耦合。
**解法（主理人裁决）**：新增 `src/i18n/current.ts` 模块级 locale 访问器（`getCurrentLocale()` 默认 `'zh-CN'` / `setCurrentLocale()` / `translateCurrent()`），`I18nProvider` **渲染期**同步 locale。服务层用 `translate(getCurrentLocale(), key)` 取词 —— **不改服务函数签名**，与屏幕层彻底解耦。
（因 `locales/zh/domain.ts` 反向依赖 `utils/{submission,audit}`，`translateCurrent()` 内部用懒 `require('translate')` 规避循环依赖。）

### N5｜三类"既有测试锁定"的硬边界
| 边界 | 约束 | 化解 |
| --- | --- | --- |
| `theme-contrast.test.ts:245-255` 深比较 `lightStatusColor`（含中文 `label`）+ 对象同一性 | 不能拆 / 改 `StatusStyle.label` | **保持不动**，i18n 只旁挂 |
| `increment-ui-polish.test.tsx:358-365` 对 `MainTabs.tsx` 源码做文本断言（5 个中文 Tab 名） | 不能"抽出即删" | **zh 字面串留在原文件**，新增 `TAB_LABEL_EN` 渲染期选表 |
| 全仓静态红线（`walk(src)` 扫全部 `.ts/.tsx`） | 新增 i18n 文件也要满足 | 语言包用 **`.ts`** 并**满足**（而非用 `.json` 绕过）4 条红线 |

### N6｜新全局 hook 不得走 `@/hooks` 桶
14 个既有测试对 `@/hooks` 做**工厂式 `jest.mock`**（工厂内不含新 hook，取到会 `undefined` 且只在运行时炸）；`@/store/AppProvider` 也被 12 个测试工厂式 mock。
**解法**：`useI18n` / `useT` **只从 `@/store/I18nProvider` 导出**（`src/hooks/index.ts` 零新增导出）；**新建独立 `I18nProvider`**，不并入 `AppProvider`。

---

## 三、交付物

### 新增（核心运行时）
| 文件 | 职责 |
| --- | --- |
| `src/i18n/types.ts` | `Locale` / `LocalePreference` / `TParams` / `TranslationKey` |
| `src/i18n/translate.ts` | `translate(locale, key, params?)` 纯函数 + `interpolate`（缺键回退 zh → key，绝不抛错） |
| `src/i18n/systemLocale.ts` | 设备语言探测（**唯一**引用 `expo-localization` 的文件，懒 `require`，三级兜底） |
| `src/i18n/current.ts` | 模块级 locale 访问器（**非 React 模块取词入口**） |
| `src/i18n/locales/{zh,en}/*.ts` | 8 域字典，共 **645 键**（zh/en 逐域对称） |
| `src/store/I18nProvider.tsx` | 独立 Provider + `useI18n` / `useT` + 无 Provider 兜底 |

### 修改
`App.tsx`（装配 `I18nProvider`：`AppProvider` 内、`ConnectivityProvider` 外）· `src/services/config.ts`（`PREFERENCE_KEYS.locale='os.locale'`）· `src/store/AppProvider.tsx`（新增非抛错 `useOptionalAppContext()`）· `package.json`（**唯一新增依赖 `expo-localization@~57.0.2`**，18→19）
· 16 屏 · 通用/业务组件 · `services/*` `utils/*` `types/*` 用户可见提示。

### 键统计（主理人独立复核，逐域 diff）
| 域 | 键数 | 域 | 键数 |
| --- | --- | --- | --- |
| `common` | 31 | `screens.core` | 224 |
| `domain` | 66 | `screens.more` | 148 |
| `nav` | 13 | `business` | 50 |
| `ui` | 13 | `services` | 100 |
| **合计** | | | **645（zh/en 逐域 IDENTICAL）** |

### 文档
`docs/mobile-app/PRD-mobile-increment-12-i18n.md`（PRD v2.0，700 行）· `docs/mobile-app/ARCH-mobile-increment-12-i18n.md`（架构，含类图 + 3 张时序图 + 机械迁移清单）· `ARCH-mobile.md` §10 语言边界。

---

## 四、验证结论

| 项 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | ✅ **0 错误**（全仓，含 `tests/`） |
| `npx jest --config jest.config.js` | ✅ **58 套件 / 1013 用例全绿**（108s） |
| 既有基线零回归 | ✅ 原 55 套件 / 966 用例**全部仍绿**，且**0 个既有测试文件被改动** |
| zh/en 键集合对称 | ✅ 8 域逐域 IDENTICAL，合计 645 键（主理人独立复核） |
| 静态红线 | ✅ 新增 i18n 文件满足 4 条（`increment-ui-polish` / `increment-card-lift` 绿） |
| 新增测试 | ✅ 3 套件 / 47 用例（键一致性 18 / Provider 三态+持久化+兜底 19 / zh 冻结守卫 10） |
| **`'system'` 类型约束** | ✅ `@ts-expect-error` 断言 `translate('system',…)` 为编译错误**生效** |
| 残留中文复审 | ✅ 剩余**全部落在已登记允许类别**（见 §七） |
| **真实浏览器端到端验收** | ❌ **未完成**（QA worker 429 配额失败） |
| **核心机制 fresh-eyes 独立复核** | ❌ **未完成**（QA worker 429 配额失败） |

> ⚠️ **诚实边界**：实现层目前只有**单测自证**（58/1013 全绿 + tsc 0），**尚无真实浏览器功能证据**。端到端验收待配额恢复（2026-10-08 09:50 重置）后补跑。

---

## 五、关键裁决

### 架构师裁决（PRD §7 架构类开放问题）
| 编号 | 裁决 |
| --- | --- |
| **Q6** | 偏好键 `os.locale`，三态取值 `'zh-CN'|'en-US'|'system'`（镜像 `os.theme_mode`） |
| **Q9** | `StatusStyle.label` **保持不动**，i18n 只旁挂，zh 值从 `lightStatusColor[s].label` 派生 |
| **Q10** | 被源码断言的 11 个文件，**zh 字面串留在原文件** |
| **Q11** | 语言包用 **`.ts`** 并**满足** 4 条静态红线（不靠 `.json` 绕过） |
| **Q12** | 日期本地化**不做**（P2）；**绝不动 `utils/date.ts` 的 `'en-US'`**（取数用，改了会打断星期解析） |
| **Q19** | **不启用** `expo-localization` 的 config plugin（`supportedLocales`），把改动面压到最小 |

### 主理人裁决
| 编号 | 裁决 |
| --- | --- |
| **M1** | 采用 `AppProvider` 新增非抛错 `useOptionalAppContext()`（满足"复用 `user.locale`"验收要点） |
| **M5** | `ProfileScreen` 归 T02（L1 入口），L4 核心屏去重为 7 屏 |
| **M6** | 残留中文扫描维持 P1，P0 用人工 + 精炼枚举（白名单脆弱，不落为硬断言测试） |
| **L7 取词机制** | 新增 `src/i18n/current.ts` 模块级 locale 访问器，服务/工具层 `translate(getCurrentLocale(), key)`，**不改服务函数签名** |

### 用户拍板（不可推翻）
① 语言**三态**（含「跟随系统」）⇒ **破例授权新增 `expo-localization`（本增量唯一新增依赖）**；② 本期**全量 L0–L7**；③ **默认 `zh-CN`**；④ i18n 运行时**零第三方库**（自研）。

---

## 六、过程中踩到并固化的坑

1. **ProfileScreen 正文无人认领（主理人裁决副作用）**：M5 把 ProfileScreen 整体划给 T02，但 T02 只被要求做「语言」区块，而正文键归属 `screens.core.ts`（T03 域）⇒ 英文模式下「我的」页正文仍为中文。**由主理人的残留审计发现**后，以 T03b 追加任务补译。**教训：按域拆分所有权时，必须交叉检查"屏是否被完整覆盖"，不能只看任务边界。**
2. **并行 worker 共享同一工作树**：四路并行时，A 跑 `tsc` 会看到 B 的半编辑文件（因为 `TranslationKey` 是全局联合类型）。⇒ 固化为**并发协议**：只改自己的文件、`git add` 只显式列文件（禁 `-A`）、只处理落在自己文件的报错、**只跑针对性套件不跑全量**（全量由主理人统一跑）。
3. **同一文件并行多次 Edit 会互相覆盖（last-write-wins）** ⇒ 改为逐波次串行修复。
4. **循环依赖**：`locales/zh/domain.ts` 派生自 `utils/{submission,audit}`，而后者需要取词 ⇒ `translateCurrent()` 内部**懒 `require('translate')`** 规避 TDZ/undefined。
5. **i18n hook 若走 `@/hooks` 桶会在运行时炸**（14 个测试工厂式 mock 该桶）⇒ 铁律：新全局 hook 只从自己的 Provider 模块导出。
6. **依赖计数 off-by-one**：架构文档写"19→20"，实测基线为 18 ⇒ 实为 18→19。非缺陷，但说明**文档中的统计数字必须实测复核**。
7. **QA worker 429 配额超限** ⇒ 大增量末期派 QA 需预留配额；本增量 QA 未完成。

---

## 七、遗留（非阻断）

1. **⚠️ QA 端到端验收未完成**（浏览器 E2E + 核心机制独立复核）——两条 QA 线均因 429 配额失败，待 **2026-10-08 09:50** 重置后补跑。需验证：默认中文 → 切 English 即时生效（Tab/页头/正文）→ reload 持久化 → 跟随系统 → 残留边界说明 → 英文下无中文残留 → 0 console error → 320pt 窄屏不溢出。
2. **英文模式下的显式允许残留**（PRD §6-D13，已在「语言」区块下方明示）：
   - **日期 / 星期 / 相对时间 / 字节 / 工时格式**（L8，`WorkspaceScreen` 的 `formatTodayLabel`/`weekdays`、`utils/date.ts`、`utils/format.ts`）；
   - **mock 种子业务数据**（任务标题 / 评论正文 / `AttachmentUploadSheet` 的演示文件名）—— `src/data/**` 刻意不译；
   - **服务端返回文案**（跨包，需 `Accept-Language`，另立工单）；
   - **`TaskDetailScreen:184` / `TodayFocusScreen:299,358`** 的 reason 数据串（`'重开任务'` / `'用户撤销完成操作'` / `'演示环境驳回'`）—— 是**数据**非 UI 标签，且 `'重开任务'` 被源码断言锁定；
   - **语言自名「中文」**（US-12-08 要求不随界面语言变化）。
3. **📌 web 端另有一处历史未提交改动**（`apps/web/src/hooks/useWorkspaceTasks.ts`，增量 7「审核对齐」遗留，非本增量产生）—— 用户确认**保留不动**。
4. **L8 本地化深化**（`M-P2-05-21`…`-26`）：日期/复数/第三语言/RTL/后端文案/`app.json` 应用名多语言。
5. **移动端默认仍为 mock**（`USE_MOCK=true`）；与 web 端共用同一后端前缀 `/api/v1`，**需切真实后端才真正数据互通**。

---

## 八、提交记录

| 提交 | 说明 |
| --- | --- |
| `3d3c2d7` | feat(mobile): 增量12 **T01** i18n 基础设施（类型/字典/translate/Provider/探测适配层 + 根装配） |
| `41f2d39` | feat(mobile): 增量12 **T02** 语言入口(L1) + 导航层(L2) + 通用组件层(L3) 双语化 |
| `f45fe00` | feat(mobile): 增量12 **T03** 核心 7 屏(L4) 双语化 |
| `7728c6b` | feat(mobile): 增量12 **T04** 其余 8 屏(L5) + 业务组件(L6) 双语化 |
| `95c7c33` | feat(mobile): 增量12 **T05(L7)** 服务层/工具层提示双语化（+ `i18n/current` 模块级 locale） |
| `fdc7169` | feat(mobile): 增量12 **T03b** 补译 ProfileScreen 正文 + 收口 3 处 L7 残留（离线提示/筛选标签/审核a11y） |
| `a120467` | test(mobile): 增量12 **批次 3** i18n 纯函数/Provider/zh 冻结守卫 三套件 + ARCH 语言边界 |
| `e4e28e1` | docs(mobile): 增量12 多语言 PRD v2.0 + 架构设计（含类图/时序图） |

> **本增量对 `apps/web` 改动数为 0**（逐提交核实）；`apps/web` typecheck 仍 0 错误。
> `services/api` 的既有 `tasks.service.ts` 类型错误（`SubtaskItemDto.assigneeId`）与本增量无关，未处理。
