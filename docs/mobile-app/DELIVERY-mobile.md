# OpenSchedule 移动端 App —— 交付总结

> 交付团队：软件开发团队（SOP 标准工作流） · 主理人：齐活林 · 交付日期：2026-09-26
> 工作流：标准 SOP（多页面应用 > 10 源文件）→ 产品经理 → 架构师 → 工程师 → QA（含 1 轮修复回路 + 1 轮回归）

---

## 一、TL;DR

基于 OpenSchedule 现有 Web 端（React 19 + AntD + NestJS + Prisma）与 22 张数据表，用 **React Native + Expo + TypeScript** 交付了一款**浅色高级商务风**的移动端 App，覆盖「登录 → 工作台 → 今日聚焦 → 项目看板 → 任务详情 → 时间容器 → 我的」**核心闭环 7 页**，零后端依赖（全 mock 可跑），类型检查 0 错误、**151 个单元测试全绿**、Web 静态导出成功。

---

## 二、交付概览

| 项 | 结果 |
| --- | --- |
| 交付状态 | ✅ 已完成，QA 第 5 轮判定 `ROUTE: NoOne`（无需返工） |
| 工程路径 | `apps/mobile`（与 `apps/web` 平级） |
| 源文件数 | **67 个**（`src/**`）+ 根配置 9 个 |
| PRD P0 通过率 | **16 / 16** |
| 单元测试 | **14 套件 / 237 用例 全部通过** |
| 类型检查 | `npx tsc --noEmit` → **0 错误**（strict） |
| Web 导出 | `npx expo export --platform web` → 成功，`dist/` 约 5.5MB |
| 深链往返 | **11 / 11 条路径无弹回**（真实浏览器逐条直达验证） |
| 已知问题 | 0 个 P0/P1 阻塞缺陷；9 项已声明的已知限制（见 `apps/mobile/README.md` §四） |
| 技术栈 | Expo **57.0.22** / React Native **0.86.3** / React **19.2.3** / TypeScript **6.0.3** / React Navigation **7** |

---

## 三、交付物清单

### 3.1 应用代码（新增）

| 路径 | 说明 |
| --- | --- |
| `apps/mobile/` | 完整 Expo 工程（67 个 `src/**` 源文件） |
| `apps/mobile/src/theme/` | 设计 token 唯一来源（色彩/字号/间距/圆角/阴影/动效） |
| `apps/mobile/src/screens/` | 11 个页面（7 核心页 + 通知/通知偏好/关于 + 看板） |
| `apps/mobile/src/components/` | 19 个组件（UI 原语 + 业务组件） |
| `apps/mobile/src/services/` | 服务层，`USE_MOCK` 开关 + 48 处 `TODO(real-api)` 真实接口留位 |
| `apps/mobile/src/data/` | mock 种子（时间随演示当日滚动） |
| `apps/mobile/src/navigation/` | 5 Tab + 根级共享 Stack（任务详情覆盖 TabBar）+ 深链（`linking.ts` 嵌套 screens，往返一致） |
| `apps/mobile/tests/` | 14 个测试套件 / 237 用例（含深链往返回归 `linking.test.ts` 37 用例） |
| `apps/mobile/README.md` | 启动命令、目录说明、mock↔真实 API 切换、已知限制 |

### 3.2 过程文档（新增）

| 路径 | 产出人 | 内容 |
| --- | --- | --- |
| `docs/mobile-app/PRD-mobile.md` | 产品经理 许清楚 | 299 行；产品目标 / 移动端差异 / 12 条用户故事 / P0 16 条 + P1 7 条 + P2 5 条 / 5 Tab 信息架构 / 7 页 UI 稿描述 / 数据契约 |
| `docs/mobile-app/ARCH-mobile.md` | 架构师 高见远 | 589 行；技术选型 / 46 文件清单 / 设计系统（token 全量化 + 12 条高级商务感手法）/ TS 类型 / 导航架构 / 组件签名 / 2 条时序图 / T01–T11 施工图 / 依赖清单 / 跨文件约定 / 7 项风险兜底 |
| `docs/mobile-app/QA-mobile-report.md` | QA 严过关 | 784 行；5 轮测试记录（覆盖矩阵 / 执行记录 / 缺陷清单 / 路由判定 / 变异测试 / 边界矩阵） |
| `docs/mobile-app/DELIVERY-mobile.md` | 主理人 齐活林 | 本文件 |

---

## 四、设计系统落地要点（浅色高级商务风）

| 维度 | 落地值 |
| --- | --- |
| 主色 | 深墨蓝 `#1B2A4A`（强调色面积 ≤ 10%） |
| 底色 | 浅灰 `#F7F8FA` / 象牙白 `#FBFAF7`，卡片 `#FFFFFF` |
| 卡片 | 白底 + 1px `#ECEEF2` 描边 + 低阴影（`opacity .06`）双层结构 |
| 圆角 | 仅 8 / 12 / 16 / 20 / 999 五档，禁止混用 |
| 间距 | 4pt 栅格；页面左右 20 / 卡片内 16 / 卡片间 12 / 区块间 24 |
| 字号 | 22 / 17 / 15 / 13 / 12；标题负字距 −0.2 / −0.1 |
| 动效 | 列表 stagger 40ms×≤6 + 位移 8px 淡入；按压 scale 0.97/150ms；抽屉 spring 弹入；统一缓动 `bezier(0.2,0,0,1)`；骨架屏替代转圈 |
| 交互 | 右滑快捷操作 + 撤销 Toast、乐观更新 + 失败回滚、状态变更 layout animation、计时器等宽数字防跳动 |

> 全仓已核验：无内联魔法数字（色值 / 圆角 / 间距 / 阴影全部引用 token）。

---

## 五、质量验证证据（主理人独立复跑）

```bash
cd apps/mobile
npx tsc --noEmit                      # TSC_EXIT=0
npx jest --config jest.config.js --ci # Test Suites: 10 passed / Tests: 151 passed
npx expo export --platform web        # Exported: dist（EXPORT_EXIT=0）
```

| 测试套件 | 用例数 | 覆盖 |
| --- | --- | --- |
| `date` / `format` | 39 | UTC→用户时区换算、DST、非法输入兜底；工时/相对时间格式化 |
| `task-state-machine` | 18 | 合法/非法状态迁移、终态、动作表同源一致 |
| `seed-integrity` | 14 | 关联 ID 可解析、字段齐全、时间随演示日滚动 |
| `services` | 26+ | 任务读写、40901 乐观锁 / 40902 非法迁移、计时、审核、聚焦聚合、看板、时间容器 |
| `auth` | 7 | 登录成功/失败、me/logout、生物识别回落 |
| `useTimer` | 6 | 暂停累计、**退出重进持久化恢复**、损坏数据兜底 |
| `mention` / `attachment` | 13 | @提及解析与通知生成、附件大小/类型白名单校验 |
| `round2-regression` | 28 | 重名/长名优先/空文本、20MB 边界、撤销语义与竞态、三时区一致性 |

### 5.1 浏览器实测（真实渲染验收）

用 Playwright 在 **390×844 手机视口**下对 Web 导出产物做了端到端实测，**全程 0 个控制台错误**：

| 步骤 | 结果 |
| --- | --- |
| 打开 `/` | 渲染登录页（Page Title: `Login`） |
| 点「演示账号一键填入」→ 登录 | 成功进入 `/workspace/Workspace` |
| 遍历 5 个 Tab | 今日聚焦 / 项目 / 时间 / 我的 均正常渲染 |
| 深链 `/task/task-005` | 直达任务详情（Title: `TaskDetail`），**深链能力实测可用** |
| 深链 `/projects/project-001` | 直达看板列视图（Title: `Board`） |

**截图存档**：`screenshots/mobile/` 下 `01-login.png` ~ `10-week-view.png`（登录、工作台、今日聚焦、项目列表、时间容器日视图、我的、任务详情、看板列视图、时间容器周视图），另有深链验收截图 `12-deeplink-notification-settings.png` 与 QA 过程截图 `30-*` ~ `32-*`。

**实测发现并已修复的预览问题**：Expo Web 导出为单页应用（React Navigation 的 path 路由），普通静态服务器在刷新非根路径（如 `/today/TodayFocus`）时返回 404。已补一个带 `index.html` 回退的静态服务脚本 `screenshots/mobile/spa-server.py`，修复后 `/`、`/today/TodayFocus`、`/workspace/Workspace` 均返回 200。

### 5.2 性能实测（PRD 目标 G3：首屏可交互 ≤2s）

用浏览器实测冷启动与 7 个核心页的首屏可交互耗时（390×844 视口，每页断言 `document.title` 命中才算通过）：

| 页面 | 路径 | 首屏可交互 |
| --- | --- | --- |
| 冷启动 → 登录页 | `/` | **272ms**（TTFB 3ms，bundle 1.45MB） |
| 工作台 | `/workspace` | 547ms |
| 今日聚焦 | `/today` | 616ms |
| 项目看板 | `/projects` | 522ms |
| 看板列视图 | `/projects/project-001` | 354ms |
| 任务详情 | `/task/task-005` | 595ms |
| 时间容器 | `/time` | 572ms |
| 我的 | `/me` | 603ms |

**结论：全部远优于 2s 目标（最慢 616ms，约 3 倍余量），G3 达成。**

### 5.3 时间容器布局缺陷修复（用户反馈驱动）

用户在实测中反馈「周视图不完整，布局要更自然」。经定位为**真实布局缺陷**（非样式偏好）：

| 视图 | 根因 | 修复 |
| --- | --- | --- |
| 周视图 | `WEEK_AXIS_HEIGHT=240` 把 12h 压成每小时 20px；`TimelineBlock` 的 `minHeight=28` 覆盖 `height:%` → 1 小时任务(20px)被撑到 28px，**必然重叠**；且无时间刻度列 | 改为共享左侧时间轴 + 横向滚动日期列 + 按时间比例定位 + 重叠泳道；每小时 56px；新增左侧刻度列；今天列高亮；边界延续标记（↑/↓）；进入时自动滚动到今天列 |
| 日视图 | 默认视图，所有块**满宽渲染**，DOM 实测 **7 组重叠**（如「需求文档评审」与「首页原型设计」同起点、完全叠压 84px），被覆盖的块**不可见且不可点** | 复用周视图的泳道逻辑（抽出共用 `layoutBlocks`），同簇内水平区间互不相交；窄泳道（≥3 条）退化为紧凑样式，避免标题碎成 1–2 字 |

**修复后客观复测（DOM 边界框逐对求交）**：日视图 12 块 / **0 重叠**；周视图 14 块 / **0 重叠**；控制台 0 错误。

> 这两个缺陷都**没有被单元测试与静态审查发现**，是「真实浏览器渲染 + DOM 几何测量」才暴露出来的 —— 印证了视觉/布局类问题必须用真实渲染验证。

### 5.4 时间容器视图收敛：周视图改为整周 7 列一屏（用户反馈驱动）

用户反馈「周视图就按照整周来展示即可，然后整周页删除」。据此把原先的**三个视图模式收敛为两个**：

| 形态 | 定位 | 一屏范围 |
| --- | --- | --- |
| 日视图 | 精确时间轴，单日 | 1 天（08:00–20:00 完整） |
| 周视图 | **整周 7 列一屏密度概览** | **完整 7 天，无横向滚动** |

原「周视图」是「共享时间刻度列 + 7 天横向滚动列」，受时间轴精确对齐约束一屏只能看约 2.3 天；原「整周」是 7 列一屏的密度概览。现在**取消横向滚动形态**，周视图直接采用整周密度概览的渲染方式，并删除独立的「整周」入口。

**实现变更**：
- `CalendarView` 由 `'day' | 'week' | 'overview'` 收敛为 `'day' | 'week'`；`VIEW_OPTIONS` 由 3 项减为 2 项。
- 周视图：7 列按容器宽运行时等分（390px 屏 → 46px/列，列间距 4px）；每列一条 240px 高时间带，带内按 `startAt/endAt` 比例渲染**纯色块**（按 `status` 着色，done/cancelled 灰显），复用 `assignLanes` 做水平泳道保证不叠压；今天列墨蓝实心列头 + 极淡主色底；列底显示任务数或「空闲」；**点击任意列切到日视图并定位到当天**。
- 移除旧的横向滚动周视图代码（左侧刻度列、`ScrollView horizontal`、进入时自动滚到今天列的逻辑），`WEEK_COLUMN_WIDTH` / 48px 列头等常量一并清理，样式表统一为 `week*` 命名。

**客观验证（真实浏览器 390×844）**：视图切换器仅剩「日视图 / 周视图」；周视图 `scrollWidth === innerWidth === 390`（**确无横向溢出**）；7 列宽度均 46px、间距 4px 均匀铺满；列内色块数与任务数一一对应（9/26 → 11 个、9/27 → 2 个，与日视图 11 个任务一致）；列内逐对求交 **0 叠压**；点 `9/30` 列 → 日视图「9月30日 周三」（映射正确）；日视图回归 **11 块 / 0 叠压**；控制台 **0 error**。日期映射仍由 5 时区（含负偏移 `America/New_York`）+ 跨月/跨年/闰日边界用例覆盖。

### 5.5 深链往返缺陷修复（主理人实测发现）

在性能实测环节，主理人发现一个**更本质的缺陷**：**应用自己生成的 URL，自己解析不回来。**

| 输入 URL | 修复前 | 修复后 |
| --- | --- | --- |
| `/me` | ✅ 正常（应用把地址栏改写成 `/me/Profile`） | ✅ 正常 |
| `/me/Profile` | ❌ **静默跳回 `/workspace/Workspace`** | ✅ 停留在 `/me/Profile` |
| `/time` | ✅ 正常（改写为 `/time/Calendar`） | ✅ 正常 |
| `/time/Calendar` | ❌ **静默跳回 `/workspace/Workspace`** | ✅ 停留在 `/time/Calendar` |

**根因**：`src/navigation/linking.ts` 中，`Tabs` 下每个 Tab 挂的都是「内嵌 native-stack」，但配置只写了字符串（如 `Me: 'me'`）。URL **生成端**会追加内层屏名产出两段式 `/me/Profile`，而**解析端**没有子屏配置可匹配 → `getStateFromPath` 返回 `undefined` → 静默回退初始态（`Tabs > Workspace > Workspace`）。

**修复**：为每个 Tab 补齐**显式嵌套 screens**，让生成端与解析端共用同一套映射（`Me: { path: 'me', screens: { Profile: 'Profile', … } }`）。保留两段式 URL 形态，因此**不改变既有 URL 约定**，只补齐解析能力。

**修复后客观复测（真实浏览器逐条直达，390×844，已登录）**：

```
OK | /me                      → /me/Profile              | title=Profile
OK | /me/Profile              → /me/Profile              | title=Profile
OK | /me/NotificationSettings → /me/NotificationSettings | title=NotificationSettings
OK | /me/About                → /me/About                | title=About
OK | /time                    → /time/Calendar           | title=Calendar
OK | /time/Calendar           → /time/Calendar           | title=Calendar
OK | /today/TodayFocus        → /today/TodayFocus        | title=TodayFocus
OK | /workspace/Workspace     → /workspace/Workspace     | title=Workspace
OK | /projects                → /projects                | title=ProjectList
OK | /task/task-005           → /task/task-005           | title=TaskDetail
OK | /notifications           → /notifications           | title=Notifications
```

**11/11 无弹回**，控制台 0 error。另经 QA **变异测试**验证新增回归测试的有效性：把 `Me` 改回字符串形式 → **11 failed / 26 passed**（变红）；把 `Profile`/`About` 路径互换 → **7 failed / 30 passed**（变红）；还原后逐字节一致。即测试确实能抓住该缺陷复发，而非「看起来很多、实际测不到」。

> 与 §5.3 同理：这个缺陷**不是样式问题，单元测试与静态审查都不会发现** —— 它是「浏览器直达 URL」这种真实使用路径才暴露出来的。三处缺陷（周视图重叠、日视图重叠、深链不往返）的共同教训是：**必须用真实渲染 + 真实入口路径验收**。

### 5.6 全应用回归扫测（视图收敛后）

时间容器的结构性改动（§5.4）完成后，对全部 10 条路由做了真实浏览器回归扫测（390×844，等真实内容就绪后取值）：

| 路由 | 关键内容 | 结果 |
| --- | --- | --- |
| `/workspace/Workspace` | 有 1 个任务将在 24 小时内到期 | PASS |
| `/today/TodayFocus` | 共 10 项待处理（今日到期 7 / 待我审核 2 / 临期预警 1） | PASS |
| `/projects` | 共 2 个项目 | PASS |
| `/projects/project-001` | 官网改版 2026 Q3 完成 17% · 2/12 个任务 | PASS |
| `/time/Calendar` | 空闲 2 小时可排期；日视图 / 周视图 | PASS |
| `/me/Profile` | 张伟 / zhangwei@example.com / 北极星研发组 · PRO | PASS |
| `/me/NotificationSettings` | 事件类型 × 邮件/推送/即时消息 | PASS |
| `/me/About` | v1.0.0 首版核心能力 | PASS |
| `/task/task-005` | 组件库搭建 · 进行中 · 紧急 · 负责人 王强 | PASS |
| `/notifications` | 4 条未读 | PASS |

**10/10 PASS，控制台 0 error，无横向溢出。** 日视图回归 **11 块 / 0 叠压**。

> **测量陷阱记录**：首轮扫测时多个页面显示「共 0 个项目」「空闲 0 小时」「共 0 项待处理」，一度像是全站数据崩了 —— 实际是**抓拍过早**。本项目页面多用 skeleton 骨架屏，**骨架屏不含「加载中」字样**，因此「等标题命中」与「等页面不含加载中」两种就绪判定都会提前通过。改为**等真实内容出现**（正则断言）或标题命中后沉降 1600ms，数值即全部恢复正常。结论：**内容型断言 > 状态型断言**（同类教训此前在性能实测中已出现过一次——`/me/Profile` 等路径静默重定向到工作台，不加标题断言会假通过）。

---

## 六、团队协作记录（SOP）

| 阶段 | 成员 | 产出 | 质量关卡 |
| --- | --- | --- | --- |
| 1 | 产品经理 许清楚 | PRD（P0 16 条） | 主理人核验通过 |
| 2 | 架构师 高见远 | 架构 + 设计系统 + T01–T11 施工图 | 主理人核验通过 |
| 3 | 工程师 寇豆码 | 67 源文件 + 全局一致性审查 `IS_PASS: YES` | 主理人独立复跑 tsc = 0 |
| 4 | QA 严过关（第 1 轮） | 110 用例全绿；发现 1×P1 + 5×P2 → `ROUTE: Engineer` | 主理人独立复跑 110 用例 |
| 5 | 工程师 寇豆码（修复轮） | D-01~D-06 全修 + 建议 1/2 修复 | 主理人独立复跑 123 用例 |
| 6 | QA 严过关（第 2 轮回归） | 缺陷 6/6 关闭、P0 16/16 → **`ROUTE: NoOne`** | 主理人独立复跑 151 用例 |
| 7 | 主理人（实测验收） | 浏览器端到端实测 + 性能实测 + 发现周视图布局缺陷 | 9 张截图、G3 达标 |
| 8 | 工程师 寇豆码（T17） | 重构周视图：共享时间轴 + 泳道 + 今天高亮 | `IS_PASS: YES` |
| 9 | QA 严过关（第 3 轮回归） | 泳道逻辑 17 用例、日视图未回归 → `ROUTE: NoOne`；发现日视图同类重叠（P2） | 168 用例全绿 |
| 10 | 工程师 寇豆码（T18） | 日视图接入泳道（复用 `assignLanes`），窄泳道紧凑退化 | `IS_PASS: YES` |
| 11 | 主理人（几何复测） | DOM 边界框逐对求交：日/周视图均 **0 重叠** | 170 用例全绿 |
| 12 | 工程师 寇豆码（T18） | 新增「整周」概览视图（7 列一屏 + 密度条 + 点击列跳日视图） | `IS_PASS: YES` |
| 13 | 主理人（实测验收） | 7 列一屏无横向溢出、点击列映射正确、控制台 0 错误 | 184 用例全绿 |
| 14 | QA 严过关（第 4 轮回归） | 列宽计算全区间扫描、日期映射 5 时区 + 跨月/年/闰日、三视图 0 叠压 → **`ROUTE: NoOne`** | 200 用例全绿 |
| 15 | 主理人（性能实测） | **发现深链往返缺陷**：应用自生成 URL 自己解析不回 | 11 条深链复现 |
| 16 | 工程师 寇豆码（BugFix） | `linking.ts` 每个 Tab 补齐显式嵌套 screens；新增 `tests/linking.test.ts`（37 用例） | `IS_PASS: YES`、tsc 0 |
| 17 | 主理人（实测验收） | 浏览器逐条直达 11 条深链 **0 弹回**、控制台 0 错误 | 237 用例全绿 |
| 18 | QA 严过关（第 5 轮回归） | 独立探针 28 条输入 + **变异测试 2 轮均变红**（证明测试有效）+ 14 项边界矩阵 + 回归检查 → **`ROUTE: NoOne`** | 237 用例全绿 |
| 19 | 用户反馈调整 | 「周视图按整周展示、删除整周页」→ 视图由 3 个收敛为 2 个，周视图改用 7 列一屏密度渲染 | tsc 0 |
| 20 | 实测验收 | 视图切换器仅剩日/周；周视图 7×46px 无横向溢出、0 叠压；点击列映射正确；日视图回归 0 叠压；控制台 0 error | 237 用例全绿 |

---

## 七、用户下一步建议

1. **真机体验（推荐）**：`cd apps/mobile && npm start`，用 Expo Go 扫码；演示账号 `zhangwei@example.com` / `openschedule`（登录页底部可一键填入）。
2. **浏览器快速预览**：`npm run web`，或直接看已导出的静态产物 `apps/mobile/dist/`。
3. **接真实后端**：只需设 `EXPO_PUBLIC_USE_MOCK=false` 并配置 `API_BASE`，**无需改任何页面代码**；48 处 `TODO(real-api)` 即待对接的写接口清单。
4. **上架准备**：`apps/mobile/eas.json` 已预留 profile；配置 `eas build` 即可产出 IPA/APK（首版未要求上架）。
5. **后续可扩展**：PRD 中 P1/P2 需求（推送、离线写、时间容器月视图、深色模式）与 5 条 QA 建议项已列明，可按增量 SOP 推进。

---

## 八、已知限制（已在 README 声明）

1. 首版**零后端依赖**，写操作走本地 mock 成功路径（真实接口留位齐全）。
2. 推送仅站内 + 轮询，未接 Expo Push / 厂商通道。
3. 看板状态流转用「卡片菜单 → 底部抽屉」，未做长按拖拽（与 PRD Q3 默认方案一致）。
4. Web 端生物识别不可用，自动回落密码登录；Web 端 token 降级为 `localStorage`（仅演示）。
5. 时间容器仅日 / 周视图（08:00–20:00），月 / 年视图按 PRD 收敛不做。
6. **Web 渲染已实测**（Playwright 端到端，12 张截图，0 控制台错误）；但**原生能力未实测**：真机手势（右滑/滚动冲突）、原生生物识别、首屏性能（目标 ≤2s）三项仍是验证盲区。
7. ~~**URL 形态略冗余**~~ → **已于增量 1 解决**：每个 Tab 的根屏 path 置为空字符串、多段子屏统一 kebab-case，URL 收敛为 `/workspace`、`/today`、`/projects`、`/time`、`/me`、`/me/notification-settings`、`/me/about`。往返一致性由 `tests/linking.test.ts` 的 B2 组（12 条）+ 新增 B5 组（断言旧形态 URL 已失效）守护。详见 `DELIVERY-mobile-increment-1.md`。
8. ~~**`apps/mobile/dist.bak`**~~ → **已由用户手动删除**。注意：增量 1 迭代又产生了 `apps/mobile/dist`、`dist-v2`、`dist-v3`、`dist-v4` 四个 Web 导出目录（`dist-v4` 为最新），同样受沙箱批量删除策略限制，需手动清理：`rm -rf apps/mobile/dist apps/mobile/dist-v2 apps/mobile/dist-v3`。
