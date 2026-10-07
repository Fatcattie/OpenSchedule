# QA · 增量 12「移动端多语言（中/英）」真实浏览器端到端验收

- 日期：2026-10-07 14:16（+08:00）
- 执行人：Edward（QA · `qa-real-browser`）
- 产物：`apps/mobile/dist-i18n`（bundle `index-1c02fd39c64adbc5d1ad5cdc0ddec6b2.js`，已自证运行 hash 与磁盘一致）
- 环境：`serve-dist.mjs` @ `127.0.0.1:4195`；系统 Chrome（playwright-cli）；`react`/`react-dom` 均 `19.2.3`
- **IS_PASS：NO**（10 项验收点全部走查，8 项完全通过、2 项存在**非阻断**偏差）
- **阻断项数：0**

---

## 逐条验收结论

| # | 验收点 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 默认 = 中文，5 Tab「工作台/今日/项目/时间/我的」 | ✅ PASS | tablist labels 全等命中 |
| 2 | 「语言」区块在「外观」正下方，三段 `中文/English/跟随系统` | ✅ PASS | 外观 y=368 < 语言 y=472；三段 w=114 各一 |
| 3 | 切 English 即时生效（不重载）：Tab / 页头 / 通用组件 / 我的页正文变英文 | ✅ PASS | 点击后 URL 仍 `/me`；Tab→`Workspace…Me`；页头 `Profile`；`Sign out`；正文 13 项英文标签全中 |
| 4 | 持久化：切 English 后 reload 仍英文 | ✅ PASS | reload 后 `localStorage['os.locale']='en-US'`，Tab/正文仍英文 |
| 5 | 跟随系统：设备 zh→中文、设备 en→英文 | ✅ PASS | 实测 `navigator.language=zh-CN`→中文；覆写 `navigator.languages=['en-US']` 后重解析→英文 |
| 6 | 残留说明可见且随语言切换 | ✅ PASS | 中「日期格式 / 演示数据 / 服务端提示仍为中文」→ 英「Dates, demo data and server messages remain in Chinese.」 |
| 7 | 英文下无中文残留 | ❌ **FAIL（非阻断）** | 见缺陷 D1、D2（2 处 UI 中文残留；其余仅日期/演示数据/自名「中文」，属允许例外） |
| 8 | 全程无 console error | ✅ PASS | 本次会话 11 个 `console-*.log` 全为 0 error（仅 `useNativeDriver` 环境 warning） |
| 9 | 320pt 窄屏「语言」控件与 TabBar 不溢出/不截断 | ⚠️ **部分 FAIL（非阻断）** | 语言控件 maxRight=296≤320 ✅；TabBar 无横向溢出，但 `Workspace` 被截断，见 D3 |
| 10 | 截图存证 ≥3 张 | ✅ PASS | 4 张（见下） |

**截图**：`qa-e2e/qa-e2e-i18n-zh-profile.png`、`qa-e2e-i18n-en-profile.png`、`qa-e2e-i18n-en-tabbar.png`、`qa-e2e-i18n-320-language.png`

---

## 缺陷（均**非阻断**，仅界面文案/窄屏布局）

**D1 · 英文问候语分隔符为全角中文逗号（U+FF0C）**
- 复现：英文态 → 工作台 → 顶部问候
- 实际：`Good afternoon，张伟`（分隔符码位实测 `U+FF0C`）；期望：`Good afternoon, 张伟`（半角 `,`）
- 位置：`apps/mobile/src/screens/WorkspaceScreen.tsx:286`（`{t(greetingKey(hour))}，{name}` 中逗号硬编码）

**D2 · 任务详情优先级徽标未本地化，英文态显示「高」**
- 复现：英文态 → `/task/task-001` → 状态徽标旁优先级胶囊
- 实际：优先级胶囊显示中文「高」（同屏状态徽标已是英文，形成不一致）；期望：`High`
- 位置：`apps/mobile/src/screens/TaskDetailScreen.tsx:404`（`<Tag tone="priority" priority={task.priority} text="" />`，`text=""`）→ `apps/mobile/src/components/Tag.tsx:38` 回退到 `apps/mobile/src/theme/index.ts:38` 的**硬编码中文** `priorityLabel`（`urgent:'紧急', high:'高'…`）。i18n 字典 `priority.high='High'` 已存在但此处未被使用。
- 影响面：全仓 `tone="priority"` 仅此一处。

**D3 · 320pt 窄屏 TabBar「Workspace」标签被截断**
- 复现：`resize 320 844` → 英文态底部 TabBar
- 实际：`Workspace` 需 67px、可用 54px（`scrollWidth 67 > clientWidth 54`，`text-overflow:ellipsis`）→ 显示为 `Works…`；期望：不截断
- 对比：390pt 下 5 个标签（含 `Workspace` 67px）全部完整；`Projects` 在 320pt 恰好 48/48 不截断
- 位置：`apps/mobile/src/navigation/MainTabs.tsx:48-54`（注释声明英文标签已「最短化防 320pt 截断」，实测未达）

---

## 原始证据（命令 + 输出）

```bash
# 构建（新增目录，无删除守卫冲突）
cd apps/mobile && npx expo export --platform web --output-dir dist-i18n
# → Exported: dist-i18n  |  web bundle index-1c02fd39c64adbc5d1ad5cdc0ddec6b2.js (1.8MB)

# 静态服务
node scripts/serve-dist.mjs apps/mobile/dist-i18n --port 4195 --host 127.0.0.1
# / /workspace /today /projects /time /me → HTTP 200

# 浏览器（系统 Chrome）
node pw.js --browser=chrome open "http://127.0.0.1:4195/"; node pw.js resize 390 844
# 登录：演示账号 → 登录  → URL /workspace

# 断言 1（默认中文）
{"path":"/workspace","tablistFound":true,"count":5,
 "labels":["工作台","今日","项目","时间","我的"],"selected":"工作台"}

# 断言 2（语言区块位置 + 三段）
{"path":"/me","appearanceY":368,"languageY":472,"languageBelowAppearance":true,
 "residualFound":true,"residualY":556,
 "tabs":[{"text":"浅色"...},{"text":"深色"},{"text":"跟随系统"},
         {"text":"中文","x":24,"y":512,"w":114},{"text":"English","x":138,...},{"text":"跟随系统","x":252,...}]}

# 断言 3（切 English，不重载）
clicked:English @ 195,530
{"path":"/me","labels":["Workspace","Today","Projects","Time","Me"],"selected":"Me"}
# 我的页正文英文标签 13/13 命中（Profile / Appearance / Language / Settings /
#  Notification preferences / Personal plan / My submissions / Review center /
#  Simulate offline / Time zone / About OpenSchedule / Sign out …）

# 断言 4（持久化）
reload → localStorage['os.locale'] = "en-US"；Tab/正文仍英文

# 断言 5（跟随系统）
navigator.language = "zh-CN" → click 跟随系统 → Tab 回到中文
覆写 navigator.languages=['en-US'] → click 中文 → click 跟随系统 → Tab 变英文

# 断言 7（英文逐屏 CJK 扫描，仅列 UI 残留）
/workspace    → ["伟","Good afternoon，张伟"(U+FF0C ← D1),"北极星研发组 · 10月7日 周三","Most urgent: 组件库搭建",…]
/today        → ["10月7日 周三 · 10 items pending","组件库搭建",…]   # 仅日期+演示数据
/projects     → ["官网改版 2026 Q3",…]                              # 仅演示数据
/projects/project-001 → ["官网改版 2026 Q3","需求文档评审",…]        # 仅演示数据
/task/task-001→ ["官网改版 2026 Q3","需求文档评审","高"(← D2),"伟","张伟","10月7日 → 10月7日",…]
/me           → ["伟","张伟","北极星研发组 · PRO","…motto…","中文"] # 仅演示数据+自名
/notifications→ ["「本周复盘会材料」将于 2 小时内到期","8 分钟前 · Tap to view task",…] # 服务端/mock 文案 + 相对时间
/my-submissions→["新任务：需求池看板视图","昨天 11:00","Rejection reason: …",…]
/audit-center → ["完成提报：首页原型评审",…]

# 断言 8（console）
for f in .playwright-cli/console-*.log: 本次会话 11 个日志 error 计数全为 0
# （仓库中仅有的 2 条 error 属旧会话：React #527 在 10-06、'length' 在增量11 桩会话）

# 断言 9（320pt）
{"innerWidth":320,"docScrollWidth":320,"horizontalOverflow":false,
 "segmentedMaxRight":296,"segmentedOverflow":false,"navOverflow":false}
# TabBar 标签：Workspace scrollW 67 > clientW 54 → truncated:true（← D3）；其余 false
```

---

## 盲区（如实）

- **未覆盖 native 真机**：Tab 标签字体度量、系统语言探测（`expo-localization` 原生路径）仅 Web 可验。
- **`跟随系统` 的 en-US 用例**用 `navigator.languages` 运行时覆写模拟（`playwright-cli open` 无 `--locale` 选项）；真实设备语言切换（`languagechange` 事件）未验。
- **相对时间**（`8 分钟前 / 昨天 18:05`）与「Notification preferences」在 390pt 的单行省略号：判定为**非缺陷**——前者属残留声明中「日期格式/Dates」范围，后者为单行 `numberOfLines` 设计取舍；如实登记，未计缺陷。
- 未逐一走查全部 15 屏（按任务要求覆盖了 9 屏），未覆盖的屏可能存在同类残留（可用同一 CJK 探针补扫）。

---

## 本次新增/产出文件

- `docs/mobile-app/QA-mobile-increment-12-i18n-e2e.md`（本文档）
- `qa-e2e/qa-e2e-i18n-zh-profile.png`、`qa-e2e-i18n-en-profile.png`、`qa-e2e-i18n-en-tabbar.png`、`qa-e2e-i18n-320-language.png`
- `apps/mobile/dist-i18n/**`（构建产物；旧 `dist-real` / `dist-v30` 建议后续手动清理）
- 复用未改：`qa-e2e/pw.js`、`scripts/serve-dist.mjs`；临时探针脚本已清理

> 静态服务仍在 `http://127.0.0.1:4195` 运行，便于复检；不需要时可停掉。
