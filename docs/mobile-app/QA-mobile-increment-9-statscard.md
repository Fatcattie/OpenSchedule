# QA 报告 · 移动端增量 9 —— 工作台数据卡片（M-P2-04 本周完成数 / 工时）

- **验证人**：QA 严过关（Yan）
- **验证对象**：OpenSchedule 移动端「工作台 · 本周完成」数据卡片（团队 `software-mobile-statscard`）
- **需求出处**：`docs/mobile-app/PRD-mobile.md:113` —— 工作台数据卡片（本周完成数/工时），**与数据中枢口径一致**
- **权威口径参照**：Web `GET /me/summaries?period=week`（`apps/web/src/api/summaryApi.ts`、`apps/web/src/api/mock/handlers.ts:535-600` `buildPeriodSummary`）
- **验证方式**：**独立复现**，不采信工程师自述
- **运行时刻**：2026-10-06 11:12（UTC+8）
- **结论**：**IS_PASS: YES** ｜ 路由判定 **NoOne**

---

## 0. 口径定义（用户已拍板，逐条对照源码核验）

| # | 口径 | 源码位置 | 核验 |
|---|------|----------|------|
| 1 | 窗口 = **滚动 7 天**（`start = now - 7*86400000`、`end = now`），**非自然周** | `src/services/summary.service.ts:17,35-36` | ✅ |
| 2 | 纳入 = 团队任务（`assigneeId === userId`）+ 个人任务（`userId === userId`） | `summary.service.ts:42-75` | ✅ |
| 3 | 完成条件：`status === 'done'` && `completedAt !== null` && `completedAt ∈ [start, end]` | `summary.service.ts:89-97` | ✅ |
| 4 | `stats.completedCount` = 命中条数；`stats.actualHoursTotal` = `Math.round(Σ(actualHours ?? 0) * 10) / 10` | `summary.service.ts:105-115,117-120` | ✅ |
| 5 | 字段命名逐字对齐 Web：`period` / `window.{start,end}` / `stats.completedCount` / `stats.actualHoursTotal` | `src/types/summary.ts:39-48` | ✅ |

---

## V1 类型与回归

| 项 | 命令 | 结果 |
|----|------|------|
| 类型检查 | `npx tsc --noEmit` | **退出码 0**（无输出） |
| 全量回归（首轮） | `npx jest --config jest.config.js --no-cache` | **Test Suites: 50 passed / 50 total；Tests: 884 passed / 884 total；Time: 180.28s；exit 0** |
| 全量回归（变异还原后复跑） | 同上 | **50 / 50；884 / 884；181.99s；exit 0** |

- 基线 **48 套件 / 869 用例** ⇒ 本次 **+2 套件 / +15 用例**（新增 `tests/summary-service.test.ts` 13 例、`tests/workspace-summary-card.test.tsx` 2 例），**用例数只增不减**。工程师自述 50/884 **与实测一致**。
- 两轮全量均 `--no-cache`，无超时抖动、无 `unmounted test renderer` 级联。

---

## V2 口径正确性（**独立构造用例，未复用工程师夹具**）

自建临时校验文件 `tests/__qa_v2_tmp.test.ts`（11 用例，**验证后已删除**），逐条独立证明：

| 用例 | 构造 | 期望 | 实测 |
|------|------|------|------|
| ① 距今 8 天完成 | `completedAt = now - 8d` | 不计入 | ✅ 不计入 |
| ② 距今 6 天完成 | `completedAt = now - 6d` | 计入 | ✅ 计入 |
| ③ **关键**：`< 7 天但早于本自然周起点` | 取「滚动窗口起点」与「自然周起点（周日/周一两种约定取较早者）」的**中点** | **必须计入**（钉死「非自然周」） | ✅ 计入 |
| ④ 距今 >7 天（落上一自然周） | `completedAt = now - 9d` | 不计入 | ✅ 不计入 |
| 团队 + 个人均纳入 | `assigneeId===me` 团队 + `userId===me` 个人 | 2 项 | ✅ 2 项 |
| 他人任务排除 | `assigneeId/userId` 非 me | 0 项 | ✅ 0 项 |
| `status !== 'done'` | `todo` / `blocked` | 不计入 | ✅ 不计入 |
| `completedAt === null` | `done` 但 `completedAt=null` | 不计入 | ✅ 不计入 |
| 四舍五入 | 4.5 + 7.0 + 0.5 | 12.0 | ✅ 12 |
| 四舍五入（截断会得 4.6） | 2.34 + 2.34 = 4.68 | 4.7 | ✅ 4.7 |
| 浮点误差抹平 | 0.1 + 0.2 = 0.30000000000000004 | 0.3 | ✅ 0.3 |
| 空结果兜底 | 无命中 | `completedCount===0` 且 `actualHoursTotal===0`，非 NaN/null/undefined | ✅ 全通过 |

> **用例 ③ 说明**：任务书原文的「上一自然周内、但距今 >7 天」在「滚动窗口」与「自然周」两种实现下**都会被排除**，无区分力。真正能钉死「非自然周」的是**「< 7 天、但早于本自然周起点」**——滚动窗口计入、自然周实现排除。故我用后者作为关键判据（且对周日/周一两种自然周约定取较早起点，两种实现都能被证伪）。用例 ④ 作为补充（>7 天不计入）。

**结果**：`Tests: 11 passed, 11 total`，exit 0。

---

## V3 变异测试（证明口径守护「有牙齿」）

对 `src/services/summary.service.ts`（基线 md5 `b9094166841c8836606b676ce612b60f`）逐个注入变异 → 跑 `tests/summary-service.test.ts` + `tests/__qa_v2_tmp.test.ts` → 记录是否定向变红 → 还原 → 校验 md5。

| 变异 | 注入内容 | 变红结果 | 定向命中的用例 | 还原后 md5 |
|------|----------|----------|----------------|-----------|
| **M1** 窗口改自然周 | `start = startOf('week')`（周一制） | **红**：2 套件 failed / **5 failed** | 「距今 6 天计入」「window=7天」「按时率」「V2-A ③」等 | ✅ 复原 |
| **M2** 删个人任务分支 | 个人任务 filter → `() => false` | **红**：2 套件 failed / **4 failed** | 「团队+个人合并统计」「他人任务不计入」「V2-B」「V2-D 12.0」 | ✅ 复原 |
| **M3** 去掉四舍五入 | `roundToOneDecimal` → `return value` | **红**：2 套件 failed / **4 failed** | 「Σ 四舍五入」「浮点误差抹平」「V2-D 4.7」「V2-D 0.3」 | ✅ 复原 |
| **M4** 删 `status==='done'` 过滤 | `isCompletedInWindow` 去掉 status 判断 | **红**：2 套件 failed / **2 failed** | 「status !== done 不计入」「V2-C status !== done」 | ✅ 复原 |

- **4/4 变异全部定向变红**，且每条变异都**精确命中**对应用例（非全量崩）。
- 每轮变异后 `md5sum src/services/summary.service.ts` 均回到 `b9094166841c8836606b676ce612b60f`。
- 全程 `--no-cache`，排除 transform 缓存串味。

---

## V4 ⚠️ NB-7 是否仍有牙齿（重点复验）

**背景**：工程师把 `tests/no-nested-buttons.test.tsx` 的 mock 派发由 `mockAsyncCall % 3` 改为 `% 4`（因 `WorkspaceScreen` 新增第 4 个 `useAsync`）。需确认该改动**未让 NB-7 退化为平凡通过**。

**复验方法**：往 `src/screens/WorkspaceScreen.tsx` 的「我的待办」`<TaskCard>` 注入
`right={<PressableScale accessibilityRole="button" accessibilityLabel="测试" />}`（即制造 `<button>` 嵌套 `<button>`），跑 `tests/no-nested-buttons.test.tsx`。

**结果**：

```
√ NB-1 三枚审核按钮仍存在…  √ NB-2 全树无嵌套
√ NB-5 回退分支…            √ NB-3 「⋯」切换状态…
√ NB-4 全树无嵌套           √ NB-6 今日聚焦…
× NB-7 工作台渲染待办任务卡片时，全树不存在「宿主 button 节点嵌套宿主 button 节点」
    expect(received).toHaveLength(expected)
    Expected length: 0
    Received length: 1          ← 嵌套宿主 button 被精确捕获
Test Suites: 1 failed, 1 total   Tests: 1 failed, 6 passed, 7 total
```

- ✅ **NB-7 定向变红，仍有牙齿**；其余 6 条 NB 用例保持绿 ⇒ 变异只被 NB-7 捕获，证明断言有效且非全量误报。
- ✅ `%4` 派发**正确**：调用顺序 ① todos ② approaching ③ unread ④ summary，`%4` 保证每轮渲染索引稳定对齐；若派发错乱，NB-7 的 `findAllByType(TaskCard).length > 0` 前置断言会先失败。基线（无变异）下 NB-7 绿 ⇒ 派发未退化。
- ✅ **NB-1..NB-7 全部保留、无削弱**：7 条用例齐全（NB-1~NB-7），断言均为「存在性回归守护（`toBeGreaterThan(0)`）+ 结构性反断言（`toHaveLength(0)`）」，未见注释掉、放宽或删除的断言。
- 注入后还原：`md5sum src/screens/WorkspaceScreen.tsx` 回到 `524d004b335d2ba444bc204b20b212df` ✅。

---

## V5 防作弊 / 未回归

| 项 | 方法 | 结果 |
|----|------|------|
| 用例数不下滑 | 全量 jest | **50 套件 / 884 用例 ≥ 基线 48 / 869** ✅ |
| 无 skip/only | `grep -rn "it.skip\|test.skip\|xit(\|describe.skip\|.only(" tests/` | **NONE_FOUND** ✅ |
| `seed-integrity.test.ts` 未被改 | `stat` mtime + md5 | mtime **2026-09-13 00:42:59**（与要求一致）；md5 `92c802f0e68287a187de69217cc1e082` ✅ |
| `seed-integrity` 无「条数锁定」断言 | 通读全文 | 仅 `toBeGreaterThan(0)` 与**集合相等**（`statuses`/`priorities` 的 `Set` 相等，非计数）；**无任何条数硬编码** ✅ |
| 零新增依赖 | 核对 `package.json`（根 + mobile） | summary 功能仅 import `@/data`/`@/types`/`./client`/`./config`，均为既有；`apps/mobile/package.json` 无新增依赖 ✅ |
| 裸 `<Pressable>` 白名单 | 独立 node 扫描（复刻测试正则 `/<Pressable[\s>]/`，排除 `PressableScale.tsx`） | **恰好 6 个文件**：`BottomSheet.tsx` / `Button.tsx` / `Card.tsx` / `ScreenHeader.tsx` / `SegmentedControl.tsx` / `SwipeableRow.tsx` ✅（`WorkspaceScreen.tsx` 用 `PressableScale`，不改变白名单） |

> 备注：根 `package.json` 有一处 `check:mermaid` script 变更，**属其它改动的遗留**，与本次增量无关，且非依赖项，不计入本次验收。

---

## V6 真实浏览器端到端（静态生产产物）

1. **导出**：`npx expo export --platform web --output-dir dist-v27` → `EXPORT_EXIT=0`，bundle = `_expo/static/js/web/index-8b0865022ecf35f54643255bb7a571e7.js`。
2. **静态服务**：WMI 起 `node scripts/serve-dist.mjs apps/mobile/dist-v27 --port 4189 --host 127.0.0.1`；探活 `/`、`/workspace`、`/login` 均 **HTTP 200**。
3. **产物自证**：页面 `script[0].src = http://127.0.0.1:4189/_expo/static/js/web/index-8b0865022ecf35f54643255bb7a571e7.js`，与 `dist-v27` 实际文件名**逐字一致** ✅。
4. **登录 → 工作台**（playwright，390×844）：填演示账号 `zhangwei@example.com / openschedule` → 点「登录」→ 落地 **`/workspace`**。

**卡片断言（DOM 实测）**：

```json
{
  "path": "/workspace",
  "titleFound": true,
  "sectionText": "本周完成近 7 天3完成数（项）12h实际工时",
  "metrics": ["本周完成", "近 7 天", "3", "完成数（项）", "12h", "实际工时"],
  "cardVisible": true,
  "cardRect": { "x": 20, "y": 425, "w": 350, "h": 116 },
  "nestedButtons": 0,
  "totalButtons": 24
}
```

- ✅ 卡片**可见**且渲染 **`本周完成` · `3` 完成数（项） · `12h` 实际工时**。
- ✅ **数值与口径复算一致**：`task-024`(4.5h) + `task-025`(7.0h) + `personal-001`(0.5h) = **12.0h**，共 **3 项**。运行时刻 **11:12（UTC+8）> 10:00** ⇒ `personal-001`（`completedAt` = 今日 10:00）落窗，故为 **3 项 / 12.0h**（若早于 10:00 应为 2 项 / 11.5h —— 本报告运行时刻为 11:12，取 3/12.0）。
- ✅ **无嵌套回归**：`document.querySelectorAll('button button').length === 0`（总 button 24 个，按钮未被删除，仅不嵌套）。
- ✅ **Console 0 errors**（`.playwright-cli/console-2026-10-06T03-11-27-209Z.log` 中 `grep -ci error` = 0；仅 1 条环境警告，属 RN Web 固有，非错误）。
- ✅ 截图存证：`screenshots/mobile/qa-increment9-workspace-summary-card.png`（见下图）。

> ⚠️ 依 `expo-web-e2e-verify` 技能 (s)：**生产产物控制台 0 errors 不能作为「无嵌套」证据**（`validateDOMNesting` 在 production 被剥离）。故本项以**直接 DOM 结构断言**（`button button` = 0）为准，控制台检查仅作旁证。

---

## V7 智能路由判定

**路由：NoOne** —— 全部验证通过，无源码 Bug、无测试代码 Bug。

| 判定项 | 结论 |
|--------|------|
| 源码 Bug | 无（口径逐条对齐 Web，V2/V3/V6 全绿） |
| 测试代码 Bug | 无（工程师新增 15 例 + 既有 869 例全绿；NB 套件断言完整、有牙齿） |
| 回工程师 | 不需要 |
| 自行修复 | 不需要 |

---

## 遗留问题 / 备注（均非阻断项）

1. **`PeriodSummary.draft` 字段被裁剪**：移动端 `src/types/summary.ts:38-48` 相比 Web 少 `draft` 字段（文件注释已声明「按移动端卡片所需裁剪掉 `draft`」）。本次卡片不消费 `draft`，**不属本需求范围**，判定为**有意裁剪**，不影响口径一致性。
2. **`onTimeRate` 写法差异（等价）**：Web 用 `Math.round(ratio*1000)/10`，移动端用 `roundToOneDecimal(ratio*100)`；数学上等价（`round(ratio*1000)/10`），且 `completedCount`/`actualHoursTotal` 为本次卡片实际消费字段，**无影响**。
3. **`dist-v27` 及历史 `dist-v22..v26` 目录残留**：依技能约定不批量删除（沙箱删除守卫），请用户手动清理。
4. **4189 预览服务仍在运行**（WMI 进程，便于用户自行点检）；如需停止用 `Stop-Process`。
5. **运行时刻相关值**：卡片完成数随时刻漂移（`personal-001` 在 10:00 前不落窗）。本报告数据对应 **2026-10-06 11:12（UTC+8）**；复跑者若在 10:00 前执行，预期为 **2 项 / 11.5h**（非回归）。

---

## 附：关键文件 md5 基线 / 还原核对（全部一致）

| 文件 | md5 |
|------|-----|
| `src/types/summary.ts` | `b2482a2cf572826aa9f4f20075b220a9` |
| `src/services/summary.service.ts` | `b9094166841c8836606b676ce612b60f` |
| `tests/summary-service.test.ts` | `4b690a4435cfd51f0104eb1341bc2a8a` |
| `tests/workspace-summary-card.test.tsx` | `e335dd10c9350c001bc3463a1bc887d3` |
| `src/types/index.ts` | `18a462d9e04a9b3a7ca705b96a77a51b` |
| `src/services/index.ts` | `84d66bb0e9ebf65a44fd1e31300c70f7` |
| `src/screens/WorkspaceScreen.tsx` | `524d004b335d2ba444bc204b20b212df` |
| `src/data/seed.ts` | `0bf122df8787957848704e0dc05e2b88` |
| `tests/no-nested-buttons.test.tsx` | `8fb205de7f606166f11898e12d139b09` |
| `tests/seed-integrity.test.ts` | `92c802f0e68287a187de69217cc1e082` |

> 所有变异注入均在验证后**还原并 md5 校验一致**；临时校验文件 `tests/__qa_v2_tmp.test.ts` 与脚手架已删除。
