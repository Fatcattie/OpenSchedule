# QA 验证报告（增量 8）— OpenSchedule 移动端：全局离线态与错误态统一处理

> 验证人：严过关（QA）· 独立复现，**不采信工程师自述**
> 验收口径：`docs/mobile-app/PRD-mobile-increment-8-offline.md`（§4 P0 七条 + §5 UI 设计稿）
> 设计权威：`docs/mobile-app/ARCH-mobile-increment-8-offline.md`
> 工程根：`apps/mobile`（Expo SDK 57 / RN 0.86 / TS，`USE_MOCK` 默认 true）
> 验证时间：2026-10-05（周一）· 运行时刻对本报告的时刻相关断言无影响（本次断言均非滑动窗口类）

---

## 0. 结论摘要

| 项 | 结论 |
| --- | --- |
| **IS_PASS** | **YES** |
| **路由判定** | **NoOne**（无源码 Bug；测试覆盖缺口由 QA 自行补齐并已验证） |
| V1 `tsc --noEmit` | 退出码 **0** ✅ |
| V2 全量回归 | **48 套件 / 869 用例全绿**（`--no-cache`，退出码 0）；首轮 1 套件 14 用例红经复现判定为**负载型超时抖动**（非回归）✅ |
| V3 既有测试零改动 | 12 个 `jest.mock('@/hooks')` 测试文件 **mtime 全部 ≤ 17:14**、**无新增 `isStale`/`cache` 字段** ✅ |
| V4 变异矩阵 | 5 个变异 **全部定向变红**（M2 原为覆盖盲区，已补测后变红）✅ |
| V5 浏览器端到端 | 断网降级 + 恢复刷新 **全部断言通过**（静态生产产物 `dist-v26` @ `127.0.0.1:4188`）✅ |
| 工作区还原 | 全部被变异文件 **md5 与基线逐字节一致** ✅ |
| 遗留问题 | 无阻断项；2 条单元测试盲区（M2 单点拦截 / R2 Provider 编排）**均已补齐并变异验证**；残余风险登记见 §7 |

---

## 1. 验证环境与产物

| 项 | 值 |
| --- | --- |
| 静态产物 | `apps/mobile/dist-v26`（`npx expo export --platform web --output-dir dist-v26`，退出码 0） |
| JS bundle | `_expo/static/js/web/index-8c7c4aac3fa75ff620e6a8b682216608.js`（1.7MB） |
| 静态服务器 | `screenshots/mobile/spa-server.py`，绑定 **`127.0.0.1:4188`**（WMI `Win32_Process.Create` 起，独立于作业对象）；`/`、`/Login`、`/workspace` 均 HTTP 200 |
| 视口 | `390 × 844`（移动端规格，与既有截图对齐） |
| 登录 | 演示账号一键填入（`e2e-login.js`）→ 落 `/workspace` |
| 账号 scope | `user-001:manager` |

> 环境事实遵守：未占用既有端口 4185/4186/8081；`apps/mobile/` 未被 git 跟踪，故全程用 **mtime + 内容 + md5** 核对，未使用 `git diff`。

---

## 2. V1 类型检查

```
cd apps/mobile && npx tsc --noEmit
→ TSC_EXIT=0   （无任何输出）
```

**判定：PASS**（退出码 0）。

---

## 3. V2 全量回归

命令：`npx jest --config jest.config.js --no-cache`（配置 `testTimeout: 60000`）

### 3.1 三轮结果

| 轮次 | 套件 | 用例 | 耗时 | 退出码 | 说明 |
| --- | --- | --- | --- | --- | --- |
| RUN1 | 1 failed / 46 passed / **47** | 14 failed / 849 passed / **863** | **354.4 s** | **1** | 失败集中在 `tests/audit-center-render.test.tsx`（渲染重套件） |
| 单套件隔离 | 1 passed | 16 passed / 16 | 96.6 s | 0 | 该套件**单独运行全绿** |
| RUN2（立即复跑） | **47 passed / 47** | **863 passed / 863** | **263.96 s** | **0** | 0 超时、0 卸载、0 断言错误 |
| RUN3（补测后） | **47 passed / 47** | **864 passed / 864** | **119.8 s** | **0** | 含 QA 新增 1 条守护用例（M2 盲区） |
| RUN4（R2 补测后最终） | **48 passed / 48** | **869 passed / 869** | **145.5 s** | **0** | 追加 `tests/offline-provider.test.tsx`（5 用例，见 §10） |

### 3.2 RUN1 失败定性 = 负载型超时抖动（**非回归**）

按「渲染重套件负载抖动」的判据逐条核验：

| 判据 | 实测 | 结论 |
| --- | --- | --- |
| ① 耗时显著拉长 | RUN1 **354.4 s** vs RUN2 **263.96 s**（+34%） | 抖动信号 ✓ |
| ② 同命令立即复跑 | RUN2 **全绿**（抖动消失） | 非确定性 ✓ |
| ③ 源码/测试 md5 未漂移 | 12 个测试文件 mtime ≤ 17:14；被改动源文件 md5 见 §8 | 无漂移 ✓ |
| ④ 错误类型统计 | RUN2：`Exceeded timeout`=0、`unmounted test renderer`=0、`Expected/Received`=0；RUN1 失败信息为 `Can't access .root on unmounted test renderer`（超时→卸载级联），**无断言错误** | 「断言错误=0」是最硬证据 ✓ |
| ⑤ 失败套件可隔离复现为绿 | `audit-center-render` 单跑 16/16 绿 | 非真回归 ✓ |

**判定：V2 PASS**。工程师自述「47 套件 / 863 用例」与本次实测**完全一致**。

> 基线对照：PM/架构文档记录的基线为 **44 套件 / 835 用例**；本增量为 **47 套件 / 863 用例**（新增 3 套件 / 28 用例），QA 补测后为 **864 用例**。

### 3.3 RUN3 / RUN4（最终状态）

- **RUN3**（M2 补测后）：`47 passed / 47`、`864 passed / 864`、**119.8 s**、退出码 **0**。
- **RUN4**（R2 补测后，最终）：`48 passed / 48`、`869 passed / 869`、**145.5 s**、退出码 **0**；`Exceeded timeout`=0、`unmounted`=0、`Expected/Received`=0。
- `client.ts` md5 已确认还原为基线 `df6272e003f0a7b0c48cb1650e0ae5e9`；`ConnectivityProvider.tsx` md5 已确认还原为基线 `607b2df57f24e927a472e08dd2cd8a61`。

---

## 4. V3 既有测试零改动核验

12 个以 `jest.mock('@/hooks', () => ({ ..., useAsync }))` 显式提供 `useAsync` 的测试文件：

| # | 文件 | mtime | ≤ 17:14 | mock 块内 `isStale`/`cache` |
| --- | --- | --- | --- | --- |
| 1 | `audit-center-render.test.tsx` | 2026-10-02 09:20 | ✓ | 无 |
| 2 | `board-search.test.tsx` | 2026-10-05 10:29 | ✓ | 无 |
| 3 | `bugfix-root-stack-back.test.tsx` | 2026-09-28 00:31 | ✓ | 无 |
| 4 | `draft-persist.test.tsx` | 2026-09-27 10:12 | ✓ | 无 |
| 5 | `increment2-focus-footer.test.tsx` | 2026-09-27 17:03 | ✓ | 无 |
| 6 | `increment3-notify-screen.test.tsx` | 2026-09-27 18:52 | ✓ | 无 |
| 7 | `my-submissions-rework.test.tsx` | 2026-10-02 13:09 | ✓ | 无 |
| 8 | `no-nested-buttons.test.tsx` | 2026-10-05 **17:14** | ✓ | 无 |
| 9 | `project-list-fab.test.tsx` | 2026-09-27 10:36 | ✓ | 无 |
| 10 | `screen-gate.test.tsx` | 2026-09-27 10:11 | ✓ | 无 |
| 11 | `today-focus-gate.test.tsx` | 2026-10-02 09:57 | ✓ | 无 |
| 12 | `today-focus-review-actions.test.tsx` | 2026-10-05 12:46 | ✓ | 无 |

- 全部 mtime **≤ 2026-10-05 17:14**（最晚 `no-nested-buttons` 17:14:16），工程师 17:40 才开工 ⇒ 均早于本次改动。
- `grep -n "isStale\|cache"` 对 12 个文件命中数 **0**（exit=1）⇒ `jest.mock('@/hooks')` 块内**未新增** `isStale`/`cache`。

**判定：V3 PASS**（裁决 A1「保名扩展 `useAsync`」的零改动承诺成立）。

---

## 5. V4 变异测试（证明新守护「有牙齿」）

> 方法：先记录 md5 基线 → 注入变异 → 跑对应测试（`--no-cache`）→ **必须定向变红** → 还原 → 校验 md5 复原。所有变异均在**最终测试文件**（含 QA 补测）上执行。

### 5.1 变异矩阵

| ID | 变异注入点 | 变异内容 | 目标测试 | 结果 | 判定 |
| --- | --- | --- | --- | --- | --- |
| **M1** | `src/hooks/useAsync.ts:103` | 失败时**不再读缓存**（降级回退分支恒不进入） | `tests/offline-hook.test.tsx` | **2 failed / 5 passed**，exit=1（`code===0`、`code>=500` 两条回退用例红） | **有牙齿** ✅ |
| **M2** | `src/services/client.ts:81` | `simulateLatency()` 去掉 `isSimulatedOffline()` 拦截 | 3 个离线测试 | **首次：28 passed，exit=0（未变红）** ⚠️；**补测后：1 failed / 13 passed，exit=1** | 首次=**覆盖盲区**；补测后**有牙齿** ✅ |
| **M3** | `src/screens/ProfileScreen.tsx:182` | 模拟离线开关门禁 `USE_MOCK` → `__DEV__` | `tests/offline-banner.test.tsx` | **1 failed / 7 passed**，exit=1（「USE_MOCK=false 不渲染」用例红） | **有牙齿** ✅ |
| **M4** | `src/types/api.ts:79` | `isDegradableError` → `return true` | `tests/offline-hook.test.tsx` | **1 failed / 6 passed**，exit=1（「4xx 业务码不降级」用例红） | **有牙齿** ✅ |
| **M5** | `src/services/cache.ts:49` | `buildCacheKey` 去掉 scope 前缀 | `tests/offline-cache.test.ts` | **2 failed / 11 passed**，exit=1（scope 隔离用例红） | **有牙齿** ✅ |

### 5.2 M2 覆盖盲区（**已由 QA 补齐**）

- **发现**：全仓测试**无任何一处**引用 `simulateLatency` / `services/client`（`grep -rn "simulateLatency" tests/` → 0 命中）。原 3 个新增离线测试仅覆盖 `connectivity` 单例（模块级 `setSimulatedOffline`）、`cache` 层、`useAsync` 回退分支与 UI 组件，**未覆盖「`simulateLatency()` 单点拦截」这一生产关键路径**。故 M2 首轮注入 **28 用例全绿、exit=0** ⇒ 该守护当时属**平凡通过/无效守护**。
- **补齐**：QA 在 `tests/offline-cache.test.ts` 新增 1 条守护用例（`client —— simulateLatency 单点离线拦截（§2.2）`）：
  - 模拟离线开启 → `simulateLatency()` 抛 `ApiError(code=0)` 且 `connectivity.isOffline()===true`、`getReason()==='network'`；
  - 关闭后**不自动恢复**（`isOffline` 仍 true）→ 一次成功 `simulateLatency()` 后转在线。
- **验证**：补测后正常跑 **14/14 绿**；**重注入 M2 → 1 failed / 13 passed，exit=1**（定向变红）⇒ 盲区已闭合、守护「有牙齿」。
- 说明：该拦截路径在 **V5 浏览器端到端**中亦被真实覆盖（切换「模拟离线」→ 所有请求失败 → 横幅出现），故生产行为本身**无缺陷**，缺的仅是单元测试。

### 5.3 md5 还原核对

| 文件 | 基线 md5 | 还原后 md5 |
| --- | --- | --- |
| `src/hooks/useAsync.ts` | `a2f313e32c1665be147565d255dfea2f` | 一致 ✅ |
| `src/services/client.ts` | `df6272e003f0a7b0c48cb1650e0ae5e9` | 一致 ✅ |
| `src/types/api.ts` | `1828b40efced45034e75306904112928` | 一致 ✅ |
| `src/services/cache.ts` | `0ba7454052d500d150d58a74098a1712` | 一致 ✅ |
| `src/screens/ProfileScreen.tsx` | `43ce2c2268e6623865f3be2c79a88ee4` | 一致 ✅ |

**判定：V4 PASS**（5 个变异全部定向变红；工作区零残留）。

---

## 6. V5 真实浏览器端到端（静态生产产物）

### 6.1 断网降级（有缓存）

**路径**：登录 → `/workspace` 在线加载一次（缓存落盘）→ 切「我的」→ 打开「模拟离线」→ 回「工作台」。

**在线态（前置）**：`localStorage` 已写入缓存键：
```
os.cache.__index__
os.cache.user-001:manager.unread:count
os.cache.user-001:manager.tasks:approaching
os.cache.user-001:manager.todos:mine
```
（横幅不存在、无「缓存」字样）

**离线态断言**（`/workspace`）：

| # | 断言 | 实测 | 结果 |
| --- | --- | --- | --- |
| ① | `OfflineBanner` 可见且文案为「无网络」类 | `hasBanner=true`；banner 文案 = 「当前无网络连接 / 正在显示上次缓存内容 / 重试」 | ✅ |
| ② | **仍渲染缓存数据**（非整屏 ErrorState） | `共 7 条` 列表照常渲染；`errStateCount=0`（无「加载失败」节点） | ✅ |
| ③ | 出现「缓存」标记 + 相对时间 | `hasStaleBadge=true`；文案「上次更新 1 分钟前」 | ✅ |
| ④ | 有「重试」入口 | `aria-label="重试"` 节点数 = 1 | ✅ |

### 6.2 恢复后自动刷新

**路径**：关闭「模拟离线」开关（不碰屏幕其它区域）→ 自动刷新。

| # | 断言 | 实测 | 结果 |
| --- | --- | --- | --- |
| ① | 横幅消失 | 切换后 ~1.5 s：`hasBanner=false` | ✅ |
| ② | 出现「已刷新」轻提示 | `hasToast=true`；文案「网络已恢复，已刷新」（见截图，check 图标 + 深色浮层）；~2 s 后自动消失（轮询实测存活窗口 ≈1.2 s–3.0 s） | ✅ |
| ③ | 数据刷新为实时态（缓存标记消失） | 最终态 `hasBanner=false`、`hasStaleBadge=false`、`hasToast=false`（已自动隐藏）、`共 7 条` 数据在线 | ✅ |

### 6.3 未回归核验

| 项 | 实测 | 结果 |
| --- | --- | --- |
| 非法 `<button>` 嵌套（`button button`） | `/workspace`=0（共 30）、`/today`=0（共 40）、`/projects`=0（共 43）、`/time`=0（共 57） | ✅ |
| 控制台错误 | 各路由 `Console: 0 errors`（1 warning 为 RN Web 固有 `useNativeDriver` 提示） | ✅ |
| 裸 `<Pressable>` 白名单 | 复现 `increment-card-lift` 的判定式（`/<Pressable[\s>]/` 且排除 `PressableScale.tsx`）⇒ **恰好 6 个文件**：`BottomSheet / Button / Card / ScreenHeader / SegmentedControl / SwipeableRow` | ✅ |

### 6.4 截图存证

| 文件 | 内容 |
| --- | --- |
| `screenshots/mobile/offline-01-workspace-stale.png` | 离线态：顶部「当前无网络连接 · 正在显示上次缓存内容 · 重试」横幅 + 「我的待办 共 7 条」+「缓存 · 上次更新 1 分钟前」标记 + 缓存卡片照常渲染 |
| `screenshots/mobile/offline-02-refreshed-toast.png` | 恢复态：底部「网络已恢复，已刷新」轻提示浮层（check 图标），横幅与缓存标记均已消失 |

**判定：V5 PASS**（验收要点「断网显示缓存与『重试』；恢复后自动刷新」在真实浏览器 + 生产产物上端到端成立）。

---

## 7. 遗留问题与残余风险

| # | 级别 | 项 | 说明 / 建议 |
| --- | --- | --- | --- |
| R1 | 已闭合 | `simulateLatency()` 单点拦截无单元测试 | 见 §5.2，QA 已补 1 条守护用例并验证定向变红 |
| R2 | **已闭环** | `ConnectivityProvider.tsx` 原**无直接单元测试** | **已补 `tests/offline-provider.test.tsx`（5 用例）**：退避 `5s→10s→30s` 时序（含转在线停止/复位）、`AppState` 回前台立即刷新、1s 尾沿节流合并；经 **MA/MB/MC 变异定向变红**验证（见 §10） |
| R3 | 盲区（如实声明） | 原生-only 能力 | ① 横幅顶部安全区在带刘海原生设备上的「双间距」（ARCH §9-M4）——Web `insets.top===0` 无法复现，仅真机可验；② `AppState` 回前台在真机（切后台/回前台）行为仅真机可验。 |
| R4 | 非缺陷观察 | `RefreshToast` 视觉上与底部 TabBar 区域重叠 | 提示浮层 `bottom: spacing.lg(20)` 落在 TabBar（y 792–844）区间内，实测**绘制在 TabBar 之上、文案完整可读**（截图 `offline-02`），且 ~2 s 自动消失。与设计（复用 `UndoToast` 定位手法、`bottom: spacing.lg`）一致，判定为**预期行为，未改**。 |
| R5 | 已覆盖 | 缓存隔离 / 清理（M-P1-06-07） | `offline-cache.test.ts` 覆盖 `clearAllCache` 逐键删除 + scope 隔离；`AppProvider` 在 `:122 setCacheScope` / `:244 clearAllCache` 已接入（本次未在浏览器验证 signOut 链路，属单元测试已覆盖项）。 |

---

## 8. 工作区还原核对（md5）

变异测试注入的全部源文件均**已还原且 md5 与基线逐字节一致**（见 §5.3）。其余本次新增/修改文件 md5（供交叉核对，均未被 QA 改动）：

```
362483c2109ebc357418056746c4aed1  src/services/connectivity.ts
eb3aa7e98e6bdc68368772f0406a32d4  src/components/OfflineBanner.tsx
168d7c22531b417a2e8b2da513b19223  src/components/RefreshToast.tsx
97a88f379cf12fd5137b033087ba4c14  src/components/StaleBadge.tsx
e64d2a6be297220598222b440572b344  src/components/Tag.tsx
36be409ac80f80ed7da48f741ca1ad2c  src/components/index.ts
607b2df57f24e927a472e08dd2cd8a61  src/store/ConnectivityProvider.tsx
d6ffaaee9693cf41a61add9a1d36fd5f  src/store/AppProvider.tsx
e0e1456b5078b1ed0e2a0d88d97e8f28  App.tsx
2f93b5c559d7c9a4fc1501264c062421  src/services/config.ts
```

QA 唯一改动的文件：`tests/offline-cache.test.ts`（新增 1 条守护用例，见 §5.2；`md5=63737d5f575f260ae379cb4bcc3a156e`）。**未修改任何 `src/` 生产代码**。

---

## 9. 附录：验收要点逐条对照（PRD §1.1 / §4 P0）

| 验收要点 | 证据 | 结论 |
| --- | --- | --- |
| 断网显示缓存 | V5 §6.1 ②（`共 7 条` 照常渲染、`errStateCount=0`） | ✅ |
| 断网显示「重试」 | V5 §6.1 ④（`aria-label="重试"`=1）+ 离线横幅 | ✅ |
| 恢复后自动刷新 | V5 §6.2（横幅消失 + 「已刷新」提示 + 缓存标记消失，无需用户操作，~1.5 s 内） | ✅ |
| M-P1-06-01 缓存落盘 | V5 §6.1 在线态（`os.cache.user-001:manager.*` 4 键）+ `offline-cache.test.ts` 读写往返 | ✅ |
| M-P1-06-02 降级展示（不整屏报错） | V5 §6.1 ②③ | ✅ |
| M-P1-06-03 无缓存沿用 ErrorState | `offline-hook.test.tsx`（无缓存失败 → error 置位，isStale=false） | ✅ |
| M-P1-06-04 手动重试 | 横幅「重试」→ `retryNow`（`offline-banner.test.tsx` 断言回调 + V5 关闭开关即触发刷新） | ✅ |
| M-P1-06-05 恢复自动刷新 | V5 §6.2 | ✅ |
| M-P1-06-06 缓存/实时可区分 | V5 §6.1 ③ / §6.2 ③（标记出现/消失）+ `StaleBadge` 相对时间用例 | ✅ |
| M-P1-06-07 缓存隔离与清理 | `offline-cache.test.ts`（scope 隔离 + clearAllCache）+ `AppProvider` 接入 | ✅ |
| M-P1-06-08 可演示离线开关（验收前提） | `offline-banner.test.tsx`（`USE_MOCK` 门禁正反用例）+ V5 实际开关生效 | ✅ |

---

## 10. R2 闭环：`ConnectivityProvider` 直接单元测试（QA 补测）

> 背景：原增量对 `src/store/ConnectivityProvider.tsx` 的三条**恢复编排机制**（退避探测、回前台刷新、尾沿节流）**无直接单元测试**——仅通过 UI 组件间接覆盖，属 R2 自报盲区。本节为闭环记录。QA 仅新增测试文件，**未改动任何 `src/` 生产代码**。

### 10.1 新增用例清单

文件：`tests/offline-provider.test.tsx`（**5 用例**，`md5=fc60fa46bf927c6952828f60469f60c0`）

| # | describe | 用例 | 断言要点 |
| --- | --- | --- | --- |
| 1 | 退避探测时序 | 离线后探测在 5/10/30/30s 触发刷新；转在线即停止并复位 | 实测刷新时刻序列 `recorded === [6000,16000,46000,76000]`（探测 tick 5s/10s/30s/30s 封顶，各经 1s 尾沿节流落地） |
| 2 | 退避探测时序 | 转在线后停止探测；再次离线时退避复位到初始 5s | `notifyNetworkSuccess` 后推进 40s 无新增刷新；再次离线后首个刷新仍在「5s + 1s」处 ⇒ 退避计数复位 |
| 3 | AppState 回前台 | 离线时 `background`/`inactive` → `active` 立即触发一次刷新（不等退避） | 取 `AppState.addEventListener('change', handler)` 回调；离线态 `handler('active')` → 1s 节流后 `refetch` 调用数 +1；在线态回前台**不**触发 |
| 4 | 1s 尾沿节流合并 | 1s 内多次刷新信号只产生一次 `refetchAll`（尾沿触发） | 连续 3 次 `retryNow()` 后立即调用数 =0；推进 999ms 仍 =0；到 1000ms 恰好 =1；再推进 5s 仍 =1 |
| 5 | 1s 尾沿节流合并 | 单次恢复只产生一个「已刷新」提示（offline → online） | `findAllByType(RefreshToast)` 长度 =1、`visible=true`、`message='网络已恢复，已刷新'`；重复 `notifyNetworkSuccess` 不产生额外提示 |

**观测手法说明**：注册真实 `refetcher`（`connectivity.registerRefetcher`）作为 `refetchAll` 落地计数，规避对 ESM 命名空间做模块级 spy 不可靠的问题；`AppState.addEventListener` 用 `jest.spyOn` 取回调。`jest.useFakeTimers()` + `advanceTimersByTime` 驱动虚拟时钟。

### 10.2 变异矩阵（MA / MB / MC）

> 方法同 §5：记录 md5 基线 → 注入变异 → 跑 `tests/offline-provider.test.tsx`（`--no-cache`）→ **必须定向变红** → 还原 → 校验 md5。

| ID | 变异注入点 | 变异内容 | 目标用例 | 结果 | 判定 |
| --- | --- | --- | --- | --- | --- |
| **MA** | `src/store/ConnectivityProvider.tsx` `PROBE_DELAYS_MS` | `[5000,10000,30000]` → `[5000,5000,5000]`（退避不递增） | 用例 1（退避时序） | **1 failed / 4 passed**，exit=1（用例 1 第 103 行时序断言红） | **有牙齿** ✅ |
| **MB** | `src/store/ConnectivityProvider.tsx` AppState 监听 | 移除 `AppState.addEventListener('change', …)` 注册 | 用例 3（回前台） | **1 failed / 4 passed**，exit=1（用例 3 第 173 行 `changeCall` 未定义红） | **有牙齿** ✅ |
| **MC** | `src/store/ConnectivityProvider.tsx` `REFRESH_THROTTLE_MS` 节流 | 去掉 1s 尾沿节流（刷新信号即时落地，不合并） | 用例 4 / 5（节流合并、单次恢复单提示） | **4 failed / 1 passed**，exit=1（用例 4 第 217 行「未立即刷新」红 + 时序断言级联） | **有牙齿** ✅ |

- 三条机制**各自独立**被 MA/MB/MC 定向打红 ⇒ 新守护对退避、回前台、节流三者均**非平凡**。
- **md5 还原核对**：`src/store/ConnectivityProvider.tsx` 三次注入后均还原，最终 `md5=607b2df57f24e927a472e08dd2cd8a61` = §8 基线，逐字节一致 ✅。
- 过程中修复一处**测试自污染**：`jest.spyOn(AppState,'addEventListener')` 对已 mock 方法复用同一 mock 实例，跨用例累积调用记录 → 通过 `appStateSpy.mockClear()` 消除（修复前 MA 在全量下会误伤用例 2）。

### 10.3 最终回归与类型检查

| 项 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 退出码 **0** ✅ |
| 全量 `npx jest --no-cache`（RUN4） | **48 套件 / 869 用例全绿**，145.5 s，退出码 **0**；`Exceeded timeout`=0、`unmounted`=0、`Expected/Received`=0 ✅ |
| 工作区 | **未修改任何 `src/` 生产代码**；QA 新增 `tests/offline-provider.test.tsx`，此前新增 1 条守护于 `tests/offline-cache.test.ts` ✅ |

### 10.4 对 V2 RUN1 失败套件（`audit-center-render.test.tsx`）的简短判断

**结论：属既有「渲染重套件」的负载型超时抖动，与本增量无关，非回归。** 依据：

1. **非确定性**：RUN1（354.4 s）红 14 例，同命令立即复跑 RUN2（263.96 s）**全绿**；该套件单独运行亦 **16/16 绿**。
2. **无断言错误**：失败信息全为 `Can't access .root on unmounted test renderer`（超时→卸载级联），`Expected/Received` = 0。
3. **无漂移**：该文件 mtime `2026-10-02 09:20`（早于本次开工 17:40），`jest.mock('@/hooks')` 块内无新增 `isStale`/`cache` 字段（见 §4）。
4. **根因**：渲染重套件在机器负载偏高（RUN1 耗时比 RUN2 高约 34%）时逼近 `testTimeout=60000`，超时后 renderer 卸载引发级联报错——**抖动触发条件为负载，而非代码变更**。

> 建议（非阻断）：若后续该套件在 CI 上仍偶发超时，可对其单独调高 `testTimeout` 或拆分用例，与 M-P1-06 无关。
