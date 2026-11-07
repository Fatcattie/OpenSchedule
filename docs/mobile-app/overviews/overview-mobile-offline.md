# 交付概览：M-P1-06 全局离线态与错误态统一处理

> 团队 `software-mobile-offline` · 项目 `apps/mobile`（Expo SDK 57 / RN 0.86）· 日期：2026-10-05
> 需求来源：`docs/mobile-app/PRD-mobile.md:103` **M-P1-06（P1）** —— 验收要点「**断网显示缓存与「重试」；恢复后自动刷新**」

## TL;DR

给 OpenSchedule 移动端加上了**统一的离线态与缓存降级**：断网时**不再整屏报错**，而是渲染**上次成功数据的缓存** + 全局离线横幅（含「重试」）+ 「缓存·上次更新 X 前」标记；网络恢复后**自动刷新**并给一次「已刷新」轻提示。**零新增 npm 依赖**、**未改动任何既有测试**（12 个 `jest.mock('@/hooks')` 文件逐字节未动）。

## 为什么走标准 SOP

这不是单点改动 —— 它改的是**数据层**：`useAsync`（全部屏共用）、`client.ts`（网络层）、全局 Provider 与根布局。既有架构明确写着「服务端数据不做全局缓存」，本次要动这条边界，必须先有设计。故走 **产品经理 → 架构师 → 工程师 → QA** 四阶段（含增量 PRD + 增量架构）。

## 交付物

| 类型 | 文件 |
|---|---|
| 增量 PRD | `docs/mobile-app/PRD-mobile-increment-8-offline.md` |
| 增量架构 | `docs/mobile-app/ARCH-mobile-increment-8-offline.md` |
| QA 报告 | `docs/mobile-app/QA-mobile-increment-8-offline.md` |
| 总架构边界更新 | `docs/mobile-app/ARCH-mobile.md` §10（连通性 = 设备态，独立 Provider） |

**代码**：新增 6 个源文件 + 4 个测试套件；修改 18 个文件（12 个数据屏 + 6 个基础设施）。**依赖零新增**。

| 新增 | 职责 |
|---|---|
| `src/services/connectivity.ts` | 连通性被动推断单例 + 模拟离线开关 + 全屏刷新注册表（无 React 依赖） |
| `src/services/cache.ts` | AsyncStorage 缓存层（scope=`userId:role`、容量 50 条/512KB + LRU、索引式逐键清理） |
| `src/store/ConnectivityProvider.tsx` | 单例↔React 桥接；编排三条恢复路径 + 1s 尾沿节流 |
| `src/components/OfflineBanner.tsx` | 全局唯一离线横幅（network/server 文案分支 + 重试） |
| `src/components/RefreshToast.tsx` | 「网络已恢复，已刷新」轻提示（~2s 自动消失） |
| `src/components/StaleBadge.tsx` | 「缓存·上次更新 X 前」标记（60s 定时重算） |

## 关键设计决定

| 决定 | 结论 | 理由 |
|---|---|---|
| **缓存层落点** | **扩展 `useAsync`**（可选 `cache`，默认关闭），**不新增 wrapper** | 全仓**恰好 12 个**测试文件 `jest.mock('@/hooks', () => ({ useAsync }))`；改名会连锁破坏这 12 个文件。保名扩展 ⇒ mock 零改动、既有断言零变化 |
| **断网模拟** | **单点拦截 `simulateLatency()`** | 默认 `USE_MOCK=true` 时各 service 首行短路、不走 `request()` ⇒ `ApiError(0)` 永不触发。全仓 **60 处** mock 调用点都先 `await simulateLatency()` ⇒ 一处生效、全局模拟断网（读+写），**60 处调用点零改动** |
| **降级判据** | `code===0 \|\| (500 ≤ code < 600)` | 本仓业务错误码是 **5 位数**（40301/40901/40902），字面 `code>=500` 会误判为可降级 → 反而显示陈旧数据 |
| **模拟离线开关门禁** | **`USE_MOCK === true`**（**非 `__DEV__`**） | 浏览器验收跑**生产 web 包**（`__DEV__=false`），只用 `__DEV__` 会导致验收端看不到开关 |
| **缓存新鲜度** | 不设硬 TTL | 硬过期会「有缓存仍报错」，与目标冲突；改相对更新时间 + 容量上限 + LRU |
| 屏幕改造量 | 三态结构**不变** | hook 内部把「有缓存」吸收为「成功 + `isStale`」 |

## 验证证据

### 类型与回归
- `npx tsc --noEmit` → **exit 0**（主理人独立复跑确认）
- 全量 `--no-cache` → **48 套件 / 869 用例全绿**（基线 44/835 ⇒ 新增 4 套件 / 34 用例，**零回归**）

### 变异矩阵（证明守护「有牙齿」）

| 变异 | 定向变红 |
|---|---|
| M1 `useAsync` 失败不读缓存 | offline-hook 2 failed ✅ |
| **M2 去掉 `simulateLatency()` 拦截** | 首轮 **28 全绿（覆盖盲区！）** → 补 1 条守护后 1 failed ✅ |
| M3 门禁 `USE_MOCK`→`__DEV__` | offline-banner 1 failed ✅ |
| M4 `isDegradableError`→`true` | offline-hook 1 failed ✅ |
| M5 `buildCacheKey` 去 scope | offline-cache 2 failed ✅ |
| MA 退避序列 `5/10/30`→`5/5/5` | provider 用例 1 红 ✅ |
| MB 移除 `AppState` 监听 | provider 用例 3 红 ✅ |
| MC 去掉 1s 尾沿节流 | provider 用例 4/5 红 ✅ |

> **M2 是本次最有价值的发现**：变异「去掉核心拦截」首轮 28 个用例**全绿** ⇒ 全仓**无任何测试引用 `simulateLatency`/`services/client`** ⇒ 最核心的机制**零覆盖**。QA 自行补测后才有牙齿。

### 真实浏览器端到端（验收要点的决定性证据）

静态生产产物 `dist-v26` @ `http://127.0.0.1:4188`（390×844）：

| 步骤 | 断言结果 |
|---|---|
| 在线加载数据屏 | `localStorage` 写入 `os.cache.user-001:manager.{unread:count, tasks:approaching, todos:mine}` |
| 打开「模拟离线」 | ①横幅「当前无网络连接／正在显示上次缓存内容／重试」可见 ②**「共 7 条」照常渲染、`errStateCount=0`**（无整屏错误态）③「缓存·上次更新 1 分钟前」标记 ④重试节点 = 1 ✅ |
| 关闭开关 | ①横幅消失 ②「网络已恢复，已刷新」轻提示（~2s 自动消失）③缓存标记消失、数据转在线 ✅ |

**未回归**：`button button` 嵌套 `/workspace=0(30)`、`/today=0(40)`、`/projects=0(43)`、`/time=0(57)`；各路由 Console 0 errors；裸 `<Pressable>` 白名单恰 6 文件。

截图：`screenshots/mobile/offline-01-workspace-stale.png`、`offline-02-refreshed-toast.png`

## 遗留问题（非阻断）

1. **`audit-center-render.test.tsx` 负载型超时抖动**（既有脆弱性，非本次引入）—— RUN1 在 354s 负载下红 14 例（`Can't access .root on unmounted test renderer`），同命令立即复跑即全绿、单套件隔离 16/16 绿、零断言错误。根因是负载偏高时逼近 `testTimeout=60000`。**建议**：CI 上若仍偶发，单独调高该套件 `testTimeout` 或拆分用例。
2. **刘海安全区双间距**（ARCH §9-M4）—— 仅真机可验，Web 验收 `insets.top=0` 不受影响。
3. **`RefreshToast` 与底部 TabBar 区域重叠**（非缺陷）—— 绘制在 TabBar 之上、文案完整可读、2s 自动消失，与设计一致。

## 访问与复现

| 产物 | 地址/命令 |
|---|---|
| 本次静态预览（含离线能力） | **http://127.0.0.1:4188**（`dist-v26`） |
| 移动端旧预览 | `http://127.0.0.1:4185`（`dist-v25`，**不含**本次能力） |
| Web 预览 | `http://127.0.0.1:4186` |
| App dev server | `http://127.0.0.1:8081` |

**手动验收路径**：登录 → 任意数据屏（先在线加载一次，让缓存落盘）→ 「我的」页打开「模拟离线」→ 回该屏 ⇒ 应看到缓存 + 横幅 + 缓存标记；关闭开关 ⇒ 横幅消失 + 「已刷新」提示。

## 后续可推进项（需求池剩余）

- **P2-04** 工作台数据卡片（本周完成数/工时）
- **P2-01** 深色模式跟随系统
- P1-06 的 P1/P2 增强项：缓存预渲染（SWR）、新鲜度过期文案、恢复刷新节流参数化、离线写排队补传
