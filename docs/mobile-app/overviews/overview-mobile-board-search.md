# P1-07 项目看板「任务搜索」— 交付概览

## TL;DR

在移动端**项目看板列视图**（`BoardScreen`）顶部加了紧凑搜索条：输入关键词后**实时过滤**当前项目的任务卡片，匹配字段（标题 / 描述 / 标签，大小写不敏感）与 **Web 端 `searchWorkspace` 逐字对齐**。改动落在 **1 个新源文件 + 1 个改动源文件 + 1 个新测试文件**，零新增 npm 依赖。全量 **42 套件 / 821 用例全绿**（基线 41/808），`tsc --noEmit` 零错误。

> **附带修复**：验证过程中发现并修复了 `apps/mobile` 全量测试在 `--no-cache` 慢轮下的**负载型超时抖动**（`jest.config.js` 的 `testTimeout` 20000 → 60000）。修复后 `--no-cache` **连续两轮 42 套件 / 821 用例全绿**。详见第五节。

---

## 一、需求与落点决策

需求池原文（`docs/mobile-app/PRD-mobile.md` 的 M-P1-07）：

> **项目看板**：项目筛选（进行中/已归档）与任务搜索 —— 结果与 Web 端一致

**落地前的缺口核查**：

| 子项 | 状态 |
| --- | --- |
| 项目筛选（进行中/已归档） | ✅ **已有**（`ProjectListScreen` 的 `SegmentedControl`） |
| 任务搜索 | ❌ 未实现（全仓 `search` 相关 0 处） |

**落点决策**：PRD 把该需求归在「**项目看板**」下，故落在**看板列视图**（`BoardScreen`）——进入某项目后，搜索框实时过滤该项目的任务卡片。理由：①最贴 PRD 措辞；②自包含、最小变更；③匹配字段与 Web 端一致即可满足「结果与 Web 端一致」。

> 备选方案（未采用）：①项目列表页跨项目搜索；②新建全局搜索页对齐 Web 端 `/search`。若后续需要，可在此基础上升级。

---

## 二、实现

### 文件清单

| 文件 | 类型 | 作用 |
| --- | --- | --- |
| `apps/mobile/src/utils/search.ts` | 新增 | 纯函数 `matchesTaskKeyword` / `filterBoardColumns` |
| `apps/mobile/src/screens/BoardScreen.tsx` | 修改 | 搜索条 + 过滤渲染 + 空态分层 |
| `apps/mobile/tests/board-search.test.tsx` | 新增 | 纯函数 7 例 + 组件 6 例 = 13 例 |

### 匹配语义（与 Web 端对齐）

`apps/web/src/utils/searchWorkspace.ts` 的任务分支为：

```
text = [title, description ?? '', (tags ?? []).join(' ')].join(' ')
命中 = text.toLowerCase().indexOf(keyword.trim().toLowerCase()) >= 0
```

移动端 `src/utils/search.ts` **逐字复刻**该语义：

```ts
export function matchesTaskKeyword(task: Task, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return true                                   // 空关键词 ⇒ 不过滤
  const text = [task.title, task.description ?? '', (task.tags ?? []).join(' ')].join(' ')
  return text.toLowerCase().indexOf(kw) >= 0
}

export function filterBoardColumns(columns: BoardColumn[], keyword: string): BoardColumn[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return columns                                // 原样返回，引用不变
  return columns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) => matchesTaskKeyword(task, kw)),
  }))
}
```

要点：仅 `import type` 依赖 `@/types`(Task) 与 `@/services`(BoardColumn) —— **编译期擦除、运行期零引用**，不引入循环依赖。

### UI 设计（`BoardScreen.tsx`）

| 元素 | 实现 |
| --- | --- |
| 搜索条 | **自建紧凑条**（48px）：`PressableScale` + RN `TextInput` + Feather `search`/`x`。未用 `TextField`（那是 56px 上浮标签框，放在头部+进度条之下偏重、挤压列高） |
| 过滤 | `useMemo(() => filterBoardColumns(columns, keyword), [columns, keyword])` |
| 列计数徽标 | 显示**过滤后**条数（`column.tasks.length`） |
| 列内占位 | `hasKeyword ? '无匹配任务' : '暂无任务'` —— **区分「本来没任务」与「被搜掉」** |
| 全局空态 | `hasKeyword && matchCount === 0` → `EmptyState`（icon=search，title「没有匹配的任务」，描述回显关键词） |
| 清空按钮 | 仅 `hasKeyword` 时渲染，点击复位 |
| 渲染条件 | 搜索条仅在**看板有列**时渲染（loading / error / 无列时不显示）——工程师主动声明的设计取舍 |

---

## 三、测试

`tests/board-search.test.tsx`（13 例）：

| 分组 | 用例 |
| --- | --- |
| 纯函数 `matchesTaskKeyword` | S-1 标题命中且大小写不敏感 / S-2 描述命中 + `description === null` 不报错 / S-3 标签命中 / S-4 空与纯空白关键词恒为 `true` |
| 纯函数 `filterBoardColumns` | S-5 保留列结构与顺序、仅替换 `tasks` / S-6 空关键词**原样返回（引用不变）** / S-7 无命中列仍保留、`tasks` 为空数组 |
| 组件 `BoardScreen` | C-1 初始渲染与空列文案 / C-2 实时过滤 + 计数徽标 / C-3 匹配描述与标签 / C-4 **「无匹配任务」文案** / C-5 全局空态 / C-6 清空按钮出现与复位 |

**全量回归**：`42 套件 / 821 用例全绿`（基线 41/808，+1 套件 / +13 用例）；`npx tsc --noEmit` 零错误。

---

## 四、QA 独立验证（严过关 · 智能路由判定：NoOne）

QA 对 A1–D16 共 16 项逐条验证，并做了 **3 组变异实证**证明测试非空转：

| 变异 | 手法 | 结果 |
| --- | --- | --- |
| M1（纯函数） | `search.ts` 去掉 `.toLowerCase()` | **4 红**（S-1/S-3/S-5 + 组件 C-3） |
| M2（组件层） | `BoardScreen` 占位逻辑改为恒「暂无任务」 | **C-4 精准红**（Expected "无匹配任务" / Received "暂无任务"） |
| M3（组件层） | `filteredColumns.map` 改回 `columns.map`（切断过滤接线） | **C-2/C-3 红** |

三组变异均按字节还原，md5 与交付态一致（主理人独立复核确认）。

**QA 额外补测（工程师未覆盖）**：正则元字符 `.*` / `(` / `[` 按**字面**包含匹配、不抛异常；`'\t\n '` 等纯空白关键词不过滤；跨字段拼接不误命中。

**QA 纠正了主理人任务书的一个错误**：建议的变异「去掉 `description ?? ''`」实为**语义等价变异**（`[a,null,b].join(' ')` 与 `[a,'',b].join(' ')` 结果相同），**不会**让测试变红 —— 不代表测试无守护力。后续变异选型应避开此类等价变异。

---

## 五、✅ 已修复：`--no-cache` 负载型超时抖动（BugFix 快捷路径）

主理人独立复核时发现：**缓存轮全绿，但 `--no-cache` 慢轮出现红色**。

| 轮次 | 耗时 | 结果 |
| --- | --- | --- |
| 缓存轮 | 78s | **42 套件 / 821 用例全绿** |
| 工程师自测 | — | 全绿 |
| QA 独立验证 | — | 全绿 |
| `--no-cache` 轮 #1 | 195.6s | 5 套件 / 39 红 |
| `--no-cache` 轮 #2 | 155.4s | 3 套件 / 23 红 |

**失败签名**：`Exceeded timeout` × 6 + `unmounted test renderer` × 40 + **断言错误 × 0**。

**判据（为何是抖动而非回归）**：
1. **两轮失败套件数不同**（5 → 3）⇒ 非确定性；
2. **零断言错误** ⇒ 没有 `Expected/Received` 不符，全是「超时 → 组件卸载 → 后续访问 `.root` 崩」的级联；
3. **同命令立即复跑即全绿**。

### 根因

`apps/mobile/jest.config.js` 的 `testTimeout: 20000` **同时覆盖「套件内首个用例执行期间的模块 `transform`/`require` 耗时」**。`--no-cache` 下每个套件要从零 transform 整个 import 图（jest-expo + RN 图很大），**重套件的首用例**因此超 20s → 超时 → 组件卸载 → 后续用例级联报 `Can't access .root on unmounted test renderer`。这解释了「6 个超时引发 40 个失败」的失衡比例。环境为 8 核 / 31.9GB，jest 默认 7 workers 并行，CPU 争抢进一步放大 transform 耗时。

### 修复（仅 1 个文件）

`apps/mobile/jest.config.js`：`testTimeout: 20000` → **`60000`**（+4 行说明注释）。**未加** `maxWorkers`（实测仅上调超时即连续两轮全绿，遵循最小变更）；**未用** `--forceExit` / 跳过用例 / 缩小 `testMatch` 等绕过手法。`src/` 与 `tests/` **零改动**（md5 与 P1-07 交付态逐一相符）。

### 验证（QA 独立验证，判定 NoOne）

| 项 | 结果 |
| --- | --- |
| `--no-cache` 连续 2 轮 | **42 套件 / 821 用例全绿**（184.7s / 197.3s） |
| 此前失败的 3 个重套件 | 两轮均 PASS（`today-focus-gate` 96.0/96.9s、`my-submissions-rework` 72.9/75.1s、`board-search` 79.8/82.9s） |
| **未掩盖回归 · 断言型变异** | 改坏 `tests/board-search.test.tsx:217` 期望值 → 报**真断言失败**（`Expected: false / Received: true`，1 failed/12 passed），非超时 ⇒ 放宽超时不吞断言失败；已还原 |
| **未掩盖回归 · 超时边界** | ①`testTimeout=1000` 单套件 → 复现原始签名；②**`testTimeout=20000` 跑全量 `--no-cache` → 4 套件 FAIL，签名与原始完全一致** ⇒ 直接证明原 20000 确实过紧，而非测试本身有问题 |
| 无副作用 | 缓存轮 66.5s 全绿（基线 78s 同量级）；`tsc` 退出码 0；无新增依赖；无 `--forceExit`、无 skip 用例、`testMatch` 未缩小 |
| 幅度判断 | **合理**：实测最慢首用例 ≈18.5s（恰卡在旧 20s 线下），60s ≈ 3.2× 余量 |

**残留风险（如实声明）**：①60s 余量基于本机 8 核/31.9GB 实测，更弱的 CI 环境理论上仍可能不够（可再叠 `maxWorkers:'50%'` 兜底）；②「transform 计入首用例 testTimeout」只做了行为层实证（1000ms 触发同签名），未从 jest 源码级确证，不影响结论。


---

## 六、盲区（如实声明，未粉饰）

1. **仅 `react-test-renderer` mock 级验证**，未在真实浏览器验证软键盘、输入法组合、真实 `TextInput` 行为。
2. `apps/mobile/` 未被 git 跟踪 ⇒ 无法做 `package.json` 字节级 diff；「无新增依赖」结论基于引用面核查。
3. 未做超大列表下 `useMemo` 过滤的性能基准（功能范围外）。

---

## 七、交付清单与下一步

**交付状态**：✅ 已完成并通过验证（QA 判定 NoOne）。

**改动文件**：
- `apps/mobile/src/utils/search.ts`（新增）
- `apps/mobile/src/screens/BoardScreen.tsx`（修改）
- `apps/mobile/tests/board-search.test.tsx`（新增）
- `apps/mobile/jest.config.js`（修改：`testTimeout` 20000 → 60000，修复 `--no-cache` 抖动）

**下一步建议**：
1. 在预览里实测：进入任意项目看板 → 顶部搜索框输入关键词 → 观察卡片过滤、计数徽标、清空按钮。
2. ~~决定是否修复 `--no-cache` 抖动~~ → **已修复**（`testTimeout` 20000 → 60000，`--no-cache` 连续两轮全绿，见第五节）。
3. 可选增强：搜索条在加载中也常驻；或升级为「跨项目 / 全局搜索」对齐 Web 端 `/search`。
4. 若要真机验收：`cd apps/mobile && npm start`（Expo Go 扫码）。
