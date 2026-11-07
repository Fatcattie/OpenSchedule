# 交付概览：M-P2-04 工作台数据卡片（本周完成数 / 工时）

> 团队 `software-mobile-statscard` · 项目 `apps/mobile`（Expo SDK 57 / RN 0.86）· 日期：2026-10-06
> 需求来源：`docs/mobile-app/PRD-mobile.md` **M-P2-04（P2）** —— 工作台展示「本周完成数 / 实际工时」数据卡片

## TL;DR

给移动端工作台（`/workspace`）顶部加了一张**「本周完成」数据卡片**：展示 **完成数（项）** 与 **实际工时（h）**，口径**逐字对齐 Web 端权威实现** `GET /me/summaries?period=week`（**滚动 7 天**，非自然周）。**零新增 npm 依赖**、**未破坏任何既有测试**（`no-nested-buttons` 仅 3 处最小改动，NB-7 断言原样）。全量 **50 套件 / 884 用例全绿**。

## 关键：口径必须是「个人周期总结」，不是项目仪表盘

Web 端内部其实存在**三套互不相同的「本周完成」口径**：

| # | 实现 | 层级 | 窗口 | 本次是否采用 |
|---|---|---|---|---|
| ① | 项目仪表盘 `DashboardStats.completedThisWeek` | **项目级** | mock 硬编码 12 / 86 | ❌ |
| ② | 个人周期总结 `/me/summaries?period=week` | **用户级** | **滚动 7 天** | ✅ **采用** |
| ③ | `ProjectListPage.tsx:240` `dayjs().startOf('week')` | 用户级 | **自然周** | ❌ |

**用户拍板选 ②（个人周期总结）**。理由：①是项目级、与「个人工作台」语义不符；③是自然周、与数据中枢不一致。②才是数据中枢的权威定义：

- `window.start = now - 7 * 86400000`，`window.end = now`（**滚动 7 天**）
- 纳入范围 = 团队任务（`assigneeId === userId`）**+** 个人任务（`userId === userId`）
- 完成条件 = `status === 'done'` && `completedAt !== null` && `completedAt ∈ [start, end]`
- `actualHoursTotal = Math.round(Σ(actualHours ?? 0) * 10) / 10`（四舍五入到 1 位小数）

## 交付物

| 类型 | 文件 |
|---|---|
| QA 报告 | `docs/mobile-app/QA-mobile-increment-9-statscard.md`（13908 字节） |
| 交付概览 | `overview-mobile-statscard.md`（本文件） |

**代码**：新增 4 个文件（2 源 + 2 测试）；修改 5 个文件。**依赖零新增**。

| 新增 | 职责 |
|---|---|
| `src/types/summary.ts` | 镜像 Web `PeriodSummary`/`SummaryStats`/`SummaryTaskItem`，字段逐字对齐，仅裁剪 `draft` |
| `src/services/summary.service.ts` | `getWeekSummary(userId)`：mock 分支 `buildWeekSummary`；真实分支 `GET /me/summaries?period=week`（`// TODO(real-api)`） |
| `tests/summary-service.test.ts` | 口径自建 13 用例（含滚动窗口边界、个人任务按 `userId`、工时四舍五入） |
| `tests/workspace-summary-card.test.tsx` | 卡片渲染 2 用例 |

| 修改 | 变更 |
|---|---|
| `src/types/index.ts` | `+ export * from './summary'` |
| `src/services/index.ts` | `+ export * as summaryService` |
| `src/screens/WorkspaceScreen.tsx` | `:141-143` 新增 `useAsync(..., { cache: { key: 'summary:week' } })`；`:255-256` 渲染 `completedCount`/`actualHoursTotal`；`:182` 下拉刷新追加 `summary.refetch()` |
| `src/data/seed.ts` | 新增 `task-024`（4.5h，`completedAt` = 距今 -2 天）、`task-025`（7.0h，-5 天），均 `assigneeId: user-001`、`status: 'done'` |
| `tests/no-nested-buttons.test.tsx` | **仅 3 处**：mock 派发 `% 3 → % 4`（WorkspaceScreen 第 4 个 `useAsync`）、新增 `let mockSummary`、`beforeEach` 复位；**NB-7 断言原样未动** |

## 关键设计决定

| 决定 | 结论 | 理由 |
|---|---|---|
| **口径来源** | 复用 Web `/me/summaries?period=week` | 数据中枢权威定义，避免自创第三套口径 |
| **窗口** | **滚动 7 天**（`now - 7d`） | 与 Web 权威实现一致；自然周会漏掉上周内近 7 天完成的任务 |
| **个人任务归属键** | 用 `userId`（**非 `assigneeId`**） | 对齐 Web `buildPeriodSummary`；个人任务无 assignee 概念 |
| **缓存** | 沿用增量 8 的 `useAsync(..., { cache })`，key = `summary:week` | 不新增 wrapper，复用已验证的离线降级能力 |
| **演示数据** | 补种子 `task-024`/`task-025` | 用户拍板「补种子数据」，让卡片在演示环境有非零数值 |

## 验证证据

### 类型与回归
- `npx tsc --noEmit` → **exit 0**
- 全量 `--no-cache` → **50 套件 / 884 用例全绿**（180.28s；基线 48/869 ⇒ 新增 2 套件 / 15 用例，**零回归**）

### 变异矩阵（证明守护「有牙齿」）

| 变异 | 预期 | 结果 |
|---|---|---|
| M1 窗口改自然周 | 口径用例变红 | ✅ 定向变红 |
| M2 个人任务改用 `assigneeId` | 个人任务用例变红 | ✅ 定向变红 |
| M3 工时不做四舍五入 | 精度用例变红 | ✅ 定向变红 |
| M4 完成条件去掉 `completedAt ∈ 窗口` | 边界用例变红 | ✅ 定向变红 |

复原后 `summary.service.ts` md5 = `b9094166841c8836606b676ce612b60f`（与 QA 报一致）。

### 真实浏览器端到端

静态生产产物 `dist-v27` @ `http://127.0.0.1:4189`（390×844）：

| 断言 | 结果 |
|---|---|
| 卡片 DOM `sectionText` | `"本周完成近 7 天3完成数（项）12h实际工时"` |
| 数值校验 | 3 项 / 12h = `task-024` 4.5 + `task-025` 7.0 + `personal-001` 0.5 ✅ |
| 嵌套按钮 | `button button` = **0** ✅ |
| Console | **0 errors** ✅ |

截图：`screenshots/mobile/qa-increment9-workspace-summary-card.png`

### ★ QA 纠正主理人的测试设计（本次最有价值的一条）

主理人原建议的用例是「**上一自然周内但距今 >7 天**」。QA 指出：该任务在**滚动窗口**与**自然周**两种实现下**都被排除**，逻辑交集为空 ⇒ **无区分力**，加了等于没加。QA 改用「**<7 天但早于本自然周起点**」⇒ 滚动实现**必须计入**、自然周实现**会排除** ⇒ **真正钉死「非自然周」**。这条纠正直接决定了对「滚动 7 天」这一核心口径的守护是否有效。

### ★ NB-7 复验（防止 mock 派发改动导致守护退化）

工程师因新增第 4 个 `useAsync` 而把 mock 派发 `%3 → %4`，理论上可能让 NB-7 退化为平凡通过。QA **主动复跑变异**：往 `<TaskCard right>` 注入 `PressableScale(accessibilityRole="button")` ⇒ NB-7 **定向变红**（Expected length 0 / Received length 1），其余 NB-1~NB-6 全绿 ⇒ **%4 派发正确、NB-7 仍有牙齿**。

## 遗留问题（非阻断）

1. **`no-nested-buttons.test.tsx` 的 `%N` mock 派发仍与真实 `useAsync` 调用点数量耦合** —— 每新增一个 `useAsync` 都要同步改模数，脆弱。建议改为 **loader 驱动**（按调用顺序/参数派发），仅动 `tests/`。
2. **卡片完成数随时刻漂移** —— 滚动 7 天窗口随 `now` 推移，10:00 前复跑预期为 2 项 / 11.5h（`task-025` 滑出窗口）。属预期行为，非缺陷。
3. **预览服务残留** —— 4188（`dist-v26`）/ 4189（`dist-v27`）仍在运行；`dist-v22..v27` 待手动清理。

## 访问与复现

| 产物 | 地址/命令 |
|---|---|
| 本次静态预览（含数据卡片） | **http://127.0.0.1:4189**（`dist-v27`） |
| 上一增量预览（离线能力） | `http://127.0.0.1:4188`（`dist-v26`） |
| Web 预览 | `http://127.0.0.1:4186` |
| App dev server | `http://127.0.0.1:8081` |

**手动验收路径**：登录 → 工作台（`/workspace`）→ 顶部应见「本周完成」卡片，显示 3 项 / 12h。

## 后续可推进项（需求池剩余）

- **M-P2-01** 深色模式跟随系统（改动面最大，建议标准 SOP）
- **M-P2-05** 多语言（中/英）
- **M-P2-03** 任务附件拍照直传（**需新增依赖**，须先决策）
- **M-P1-05** 真实推送（**需新增依赖** + 真机）
- M-P2-02 时间容器月视图 —— ⛔ PRD 已明确不做
