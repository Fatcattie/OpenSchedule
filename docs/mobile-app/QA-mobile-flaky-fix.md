# QA 验证报告：jest 负载型假红（flaky）修复

- **验证人**：QA 严过关（Yan）
- **被验证对象**：`apps/mobile/jest.config.js`（工程师 task #15）
- **验证日期**：2026-10-05
- **结论**：`IS_PASS: YES` — 根因成立、修复有效、无掩盖、加压稳健。
- **路由判定**：**NoOne**（无需回退；详见 §V6）

> 本报告所有数据均由 QA **独立执行**产出，未采信工程师自述。原始日志见 `/tmp/v1a.log`、`/tmp/v1b.log`、`/tmp/v2_run{1,2,3}.log`、`/tmp/v4_run{1,2}.log`、`/tmp/v4_margin.log`、`/tmp/v4_lower.log`。

---

## 0. 修复内容（核对无误）

`apps/mobile/jest.config.js`：
- `testTimeout: 60000 → 120000`
- 新增 `maxWorkers: 4`（本机 8 核）
- 未新增 `testPathIgnorePatterns` / `bail` / `testRegex` 等掩盖性配置；`testMatch` 为**全含**模式（见 §V3）
- `tests/setup.ts`、`tests/audit-center-render.test.tsx`、业务源码均**未被本次修复改动**（见 §V5）

---

## V1 复现实验（根因成立）

### V1a `--testTimeout=5000` 单套件（强制首用例超时）

命令：`npx jest --config jest.config.js --no-cache --testTimeout=5000 tests/audit-center-render.test.tsx`

| 指标 | 结果 |
|---|---|
| 用例 | **14 failed / 2 passed / 16 total** |
| exit code | 1 |
| 耗时 | 36.697 s |
| `Exceeded timeout` 出现次数 | **1**（即 T-1，首个用例） |
| `Can't access .root on unmounted test renderer` 出现次数 | **12** |

**与缺陷记录一致**：一个用例超时即级联出 14 红。根因链条「超时 → 放弃用例 → act 队列被污染 → 后续 renderer 永不 commit → `renderer.root` 抛错」成立。

**⚠️ 如实记录的偏差（1 例）**：团队负责人称「无任何断言失败（Expected/Received 计数为 0）」，实测存在 **1 例断言形式失败**——T-3：
```
Expected substring: "没有待审核事项"
Received string:    ""
```
其 `Received` 为**空串**，正是「渲染未 commit」的级联症状（`renderer.toJSON()` 为空），**并非业务逻辑回归**。故「无业务断言失败」的实质结论成立，但「0 断言失败」的字面表述偏 1 例。QA 予以更正记录，不视为缺陷。

### V1b 默认配置（`testTimeout=120000`）单套件

命令：`npx jest --config jest.config.js --no-cache tests/audit-center-render.test.tsx`

| 指标 | 结果 |
|---|---|
| 用例 | **16 passed / 16 total** |
| exit code | 0 |
| 耗时 | 44.017 s |
| `Exceeded timeout` | 0 |
| `unmounted` | 0 |

✅ 默认配置下首用例不再被放弃，级联被消除。

---

## V2 修复有效性（连续 3 次满载全量）

命令：`npx jest --config jest.config.js --no-cache`（全量，非单套件）

| 轮次 | 套件 | 用例 | jest 内部耗时 | 墙钟 | exit | Exceeded timeout | unmounted |
|---|---|---|---|---|---|---|---|
| RUN 1 | 48 passed / 48 | 869 passed / 869 | 134.398 s | 146 s | **0** | **0** | **0** |
| RUN 2 | 48 passed / 48 | 869 passed / 869 | 124.271 s | 134 s | **0** | **0** | **0** |
| RUN 3 | 48 passed / 48 | 869 passed / 869 | 132.229 s | 142 s | **0** | **0** | **0** |

✅ 3/3 全绿，**0 次** `Exceeded timeout`、**0 次** `unmounted test renderer`。

---

## V3 是否「偷减」用例（防作弊）

| 检查项 | 期望 | 实测 | 判定 |
|---|---|---|---|
| 测试文件数 | ≥ 48 | **48** | ✅ |
| 用例总数（全量实跑） | ≥ 869 | **869**（V2/V4 一致） | ✅ |
| `it.skip`/`test.skip`/`xit(`/`describe.skip`/`.only` | 全仓 0 | **0**（`grep` 全 `tests/` 无匹配） | ✅ |
| `audit-center-render.test.tsx` mtime | 2026-10-02 09:20 | **2026-10-02 09:20:22** | ✅ 未改动 |
| 该文件用例数 | 16 | **16**（`grep -cE "^\s*(it|test)\("`） | ✅ |
| `tests/setup.ts` mtime | 未改 | **2026-09-13 01:10** | ✅ 未改动 |
| `testPathIgnorePatterns` / `bail` / `testRegex` 等掩盖性配置 | 无 | **无** | ✅ |
| `testMatch` 是否收窄 | 应为全含 | `<rootDir>/tests/**/*.test.ts` + `.test.tsx`（全含） | ✅ 未收窄 |

✅ **无任何偷减/掩盖迹象**。

---

## V4 抗压测试（绕开配置并发，检验是否「刚好踩线」）

工程师把 `maxWorkers` 收敛到 4；QA 用 CLI 覆盖为 **8**（本机满核）验证稳健性。

### V4-a 全量 ×2（`--maxWorkers=8`，`testTimeout` 取配置 120000）

| 轮次 | 套件 | 用例 | 耗时 | exit | Exceeded timeout | unmounted |
|---|---|---|---|---|---|---|
| RUN 1 | 48/48 | 869/869 | 141.919 s | 0 | 0 | 0 |
| RUN 2 | 48/48 | 869/869 | 142.175 s | 0 | 0 | 0 |

✅ 8 worker 加压后**仍全绿**，修复不是「刚好踩线」。

### V4-b 余量探针（量化 margin）

| 探针 | 并发 | testTimeout | 结果 | exit | timeout | unmounted |
|---|---|---|---|---|---|---|
| 上余量 | 8 | 30000 | **48/48 套件、869/869 用例 全绿** | 0 | 0 | 0 |
| 下界 | 8 | 10000 | 7 套件红 / 41 绿；53 用例红 / 816 绿 | 1 | **14** | **88** |

**解读**：
- 触发阈值落在 **10s < 阈值 ≤ 30s** 之间，与工程师声称的「满载首用例 ~20s」吻合；
- 配置值 **120000 相对通过探针 30000 已有 ≥4× 余量**，相对真实阈值（约 20s）约 **6× 余量**；
- 下界探针（10000）不仅复现了级联，还显示其**波及 7 个套件**——印证这是**系统性测试基建缺陷**而非单套件问题；
- 下界探针首个崩溃套件正是 `tests/audit-center-render.test.tsx`（套件耗时 61.6s），与缺陷记录一致。

**V4 结论**：修复**稳健**，余量充足（≥4×，实际约 6×），**无需追加调整**。

**性能副观测**：4 worker 墙钟 124–146s，8 worker 墙钟 141–156s —— **收敛并发并未带来性能倒退**，反而略快（降低同图 transform 争抢），无性能回归。

---

## V5 未回归

| 检查 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | **exit 0** ✅ |
| 改动范围 | mtime + 内容核对 | 本次修复改动**仅** `apps/mobile/jest.config.js`（mtime `2026-10-05 19:11`） ✅ |
| `src/` mtime 门禁（不应晚于 18:50） | `find apps/mobile/src -newermt "2026-10-05 18:50:00"` | ⚠️ 命中 1 文件：`src/store/ConnectivityProvider.tsx`（mtime **18:51**） |

**关于 `ConnectivityProvider.tsx` 的核查（如实记录，非缺陷）**：
- 该文件头部自述为「增量 8 · Q7 / Q1 / Q12」——**离线功能工作流**，与 `tests/offline-provider.test.tsx`（mtime 18:49）成对出现，属**另一条独立任务线**；
- 内容为连通性 Provider 业务逻辑，**不含**任何测试基建（`act` / jest / 超时）相关改动；
- 其 mtime（18:51）早于本次修复文件 `jest.config.js`（19:11），**不属于**本次假红修复；
- 故「本次修复只涉及 `jest.config.js`」在**修复范围内成立**；但严格的「`src/` 无任何文件晚于 18:50」门禁**未满足**（1 个离线工作流文件命中）。QA 判定该偏差**不影响本次验证结论**，仅作为环境事实上报。

---

## V6 路由判定

- 源码/配置 Bug？**否** —— 根因（超时→放弃→act 队列污染）为测试基建缺陷，工程师修法（上调 `testTimeout` 覆盖一次性 transform 成本 + 收敛并发）**对症**，未删用例、未跳过、未削弱断言。
- QA 验证脚本 Bug？**否** —— 所有命令可复现，结果自洽。
- **判定：NoOne**（无需回退）。

---

## 残余风险

1. **`--no-cache` 冷 transform 成本随 import 图增长而上升**：当前余量约 6×，但若未来新增重型依赖使满载首用例耗时逼近 120s，仍可能复现。建议：CI 全量运行若允许，**保留 transform 缓存**（去掉 `--no-cache`）可从根本上消除该一次性成本（工程师实测首用例从 ~7.5s 降至 ~2.1s）。
2. **`maxWorkers: 4` 对更高核机器偏保守**：本机 8 核实测 4 worker 不慢于 8 worker，故当前无副作用；但在 16+ 核 CI 机器上可能未充分利用并发。属可接受的稳健性取舍。
3. **断言失败计数表述偏差 1 例**（V1a 的 T-3）：仅影响文档准确性，不影响修复正确性。
4. **`src/` mtime 门禁 1 文件命中**（离线工作流，与本修复无关）：需在跨任务审计时避免误判。

---

## 附：关键原始数字速查

```
V1a  --testTimeout=5000 单套件 : 14F/2P, exit1, 36.697s, timeout×1, unmounted×12
V1b  默认单套件               : 16P/16, exit0, 44.017s
V2   全量 ×3                  : 48/48, 869/869, exit0 ×3, timeout×0, unmounted×0
V4   全量 ×2 @8worker         : 48/48, 869/869, exit0 ×2, timeout×0, unmounted×0
探针 @8worker t=30000         : 48/48, 869/869, exit0   (余量≥4×)
探针 @8worker t=10000         : 7套件红/53用例红, exit1, timeout×14, unmounted×88
V5   tsc --noEmit             : exit0
V3   用例数 869 / 套件 48 / skip 0 / audit mtime 2026-10-02 09:20 / 16 用例
```
