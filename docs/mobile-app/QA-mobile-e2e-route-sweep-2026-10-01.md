# QA 报告 · 移动端 Web 端到端路由扫测（增量 7 审核中心）

> 验收人：交付总监（齐活林）· 运行时刻：**2026-10-01 01:26–01:29（GMT+8）**
> 产物：`apps/mobile/dist-v15`（`expo export --platform web`，Expo SDK 57 / RN 0.86.3）
> 服务：`scripts/serve-dist.mjs` @ `http://127.0.0.1:4181`（SPA 回退）
> 视口：**390 × 844**（移动端规格，与历史截图对齐）
> 工具：`playwright-cli 0.1.21` + `screenshots/mobile/pw.js` 封装
> 账号：张伟 / `zhangwei@example.com`（manager，北极星研发组 · PRO）

---

## 一、TL;DR

| 项 | 结果 |
| --- | --- |
| 路由扫测 | **13 / 14 通过**，**1 条失败** |
| 控制台 | **0 error** |
| 截图存证 | 14 张（`screenshots/mobile/audit-e2e/`） |
| **发现缺陷** | **🔴 1 条（P1）**：`AuditCenter` 未注册深链 ⇒ 审核中心页在 Web 上**无法直达**（F5 即被踢回工作台） |

**这条缺陷属于增量 7 的交付缺口** —— 增量 7 新增了 `AuditCenter` 路由，但**漏了 `linking.ts` 的注册**。

---

## 二、路由扫测（逐条冷启动直达）

| # | 请求 URL | 落地 pathname | title | 关键内容 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 1 | `/workspace` | `/workspace` | Workspace | 夜深了，张伟 · 有 7 个任务将在 24 小时内到期 | ✅ |
| 2 | `/today` | `/today` | TodayFocus | 今日聚焦 · 共 9 项待处理（今日到期 5 / 待我审核 4 / 临期预警 7） | ✅ |
| 3 | `/projects` | `/projects` | ProjectList | 项目看板 · 共 2 个项目 | ✅ |
| 4 | `/time` | `/time` | Calendar | 时间容器 08:00–20:00 · 空闲 2 小时可排期 | ✅ |
| 5 | `/me` | `/me` | Profile | 我的 · 身份、偏好与退出 | ✅ |
| 6 | `/me/notification-settings` | `/me/notification-settings` | NotificationSettings | 通知偏好 · 按事件类型选择接收渠道 | ✅ |
| 7 | `/me/about` | `/me/about` | About | 关于 · OpenSchedule v1.0.0 | ✅ |
| 8 | `/notifications` | `/notifications` | Notifications | 通知 · 4 条未读 | ✅ |
| 9 | `/submit` | `/submit` | Submission | 新建事项 · 将直接创建，无需审核 | ✅ |
| 10 | `/create` | `/create` | CreateItem | 创建事项 · 项目 / 任务 | ✅ |
| 11 | `/personal-plan` | `/personal-plan` | PersonalPlan | 个人计划 · 共 3 项个人任务 | ✅ |
| 12 | `/my-submissions` | `/my-submissions` | MySubmissions | 我的提报 · 新任务：需求池看板视图 | ✅ |
| 13 | `/task/task-001` | `/task/task-001` | TaskDetail | 任务详情 · 需求文档评审 · 待办 · 高 | ✅ |
| 14 | **`/audit-center`** | **`/workspace`** | **Workspace** | **（落到工作台，未进审核中心）** | **❌ 缺陷** |

> 第 14 条同时验证了 `/AuditCenter`（默认大小写）与 `/audit-center`（kebab-case）**两种写法**，**均回退到 `/workspace`**。

---

## 三、🔴 缺陷详情：`AuditCenter` 未注册深链（P1）

### 3.1 现象（浏览器实测）

| 请求 URL | 实际落地 | 判定 |
| --- | --- | --- |
| `/AuditCenter`（React Navigation 默认路径） | `/workspace` | ❌ 被吞 |
| `/audit-center`（kebab-case） | `/workspace` | ❌ 被吞 |
| **`/personal-plan`（对照组，已注册）** | `/personal-plan` | ✅ 正常 |

**对照组的意义**：证明不是「深链机制整体坏了」，而是**这一个屏没注册**。

> 这是典型的**静默回退**：不报 404、不报错，只是悄悄把用户送回初始路由（工作台）。肉眼若不比对 URL，很容易误以为"页面正常"。

### 3.2 用户影响

1. **Web 端按 F5 即丢失位置** —— 用户在审核中心刷新，会被踢回工作台；
2. **深链失效** —— `openschedule://audit-center` 打开的是工作台；
3. **URL 形态不合约定** —— 应用内导航生成的 URL 是 **`/AuditCenter`（大写驼峰）**，而本项目其余共享页统一 **kebab-case**（`/personal-plan`、`/my-submissions`、`/me/notification-settings`）。

### 3.3 根因

`src/navigation/linking.ts` 的 `config.screens` 中，根栈共享页**逐个以扁平字符串登记**：

```
TaskDetail: 'task/:taskId'
Notifications: 'notifications'
Submission: 'submit'          // 增量 1
CreateItem: 'create'          // 增量 1
PersonalPlan: 'personal-plan' // 增量 1
MySubmissions: 'my-submissions' // 增量 1
```

**`AuditCenter` 不在其中** —— 增量 7 只在 `stacks.tsx:134` 注册了路由组件、在 `types/navigation.ts:27` 补了参数表项，**但未同步 `linking.ts`**。

对照取证：

| 检查点 | 结果 |
| --- | --- |
| `grep -i audit src/navigation/linking.ts` | **0 命中** |
| `MainRootStackParamList` 9 个屏 vs `linking.ts` 扁平条目 | 仅 **`AuditCenter`** 与 `AiProposalSheet` 缺失 |
| `AiProposalSheet` 是否也算缺陷 | **不算** —— 它是 `presentation: 'transparentModal'` 的抽屉，本就无需深链 |
| `ARCH-mobile-increment-7-audit-alignment.md` 是否涉及 linking | **通篇未提**（`grep -i 'linking\|深链\|deep.?link'` 0 命中） |
| 是否有文档声明「审核中心不做深链」 | **无** |
| `tests/linking.test.ts` 是否覆盖 | **未覆盖**（B1 映射表无 audit 条目） |

⇒ **定性：增量 7 的注册遗漏（omission），不是有意排除。**

### 3.4 为什么 QA 之前没抓到

- `tests/linking.test.ts` 的 B1/B2 表是**硬编码清单**（`task-005` / `notifications` / `submit` / `create` / `personal-plan` / `my-submissions`），**新增屏不会自动纳入**；
- 增量 7 的 QA 报告（`QA-mobile-increment-7-audit-alignment.md:96`）只核对了 `stacks.tsx:134` 与 `types/navigation.ts:27` **两处**注册，**未把 `linking.ts` 列入核对项**；
- 组件级测试用 mock navigation，**不经过 linking 解析**。

⇒ 这是一个**三方都漏掉的盲区**：单测的表没扩、QA 的核对清单没含、组件测试不覆盖。

### 3.5 修复方案（✅ 已执行并验证通过，见 §3.6）

```ts
// src/navigation/linking.ts —— 与 Submission / CreateItem 等同级，追加一行
      MySubmissions: 'my-submissions',
+     AuditCenter: 'audit-center',   // 增量 7：审核中心（kebab-case，与既有约定一致）
```

配套补测试（`tests/linking.test.ts`）：

```ts
// B1 映射表 + B2 往返表各追加一条
{ url: '/audit-center', chain: 'AuditCenter' },
```

**预期影响**：
- 修掉深链 / F5 回退；
- URL 形态由 `/AuditCenter` 变为 `/audit-center`，与项目约定对齐；
- 测试用例数会增加（表驱动），需**同步更新交付文档中的基线数字**。

⚠️ 按既有经验，**不要**用「在 linking 里补 `initialRouteName`」这类改法（曾实测会把深链整体打回初始路由）；上面这种**扁平字符串登记**才是与其余 6 个共享页完全一致的既定模式。

### 3.6 修复结果（2026-10-01 已执行并独立复核通过）

**实际改动**（与 §3.5 方案一致，最小变更，零新增依赖）：
- `src/navigation/linking.ts`：`MySubmissions` 之后新增 `AuditCenter: 'audit-center',`（根栈扁平字符串，位于 `Tabs` 之后，**未**嵌入 `Tabs.screens`）；文件头深链清单注释同步。
- `tests/linking.test.ts`：`CASES` 末尾新增 `{ url: '/audit-center', chain: 'AuditCenter' }`。该数组被 **B1（路径解析）与 B2（往返一致性）共同遍历**，因此一条数据自动覆盖两条断言，无需改测试体。
- 未触碰 `stacks.tsx` / `types/navigation.ts`（它们本来就是对的）；未使用 `initialRouteName` 改法。

**独立复核（QA）**：
- `npx tsc --noEmit` → 退出码 **0**
- `npx jest --config jest.config.js` → **40 套件 / 783 用例全绿**（781 → 783）
- 单跑 `tests/linking.test.ts` 确认真实执行（非空跑）：`√ /audit-center → AuditCenter`（B1）、`√ AuditCenter 往返后等价（源自 /audit-center）`（B2）

**真机实测（视口 390×844）**：

| 路径 | 修复前 | 修复后 |
|---|---|---|
| `/audit-center`（目标） | `/workspace` ❌ | **`/audit-center`** ✅（Page Title: AuditCenter） |
| `/personal-plan`（对照组） | 正常 | `/personal-plan` ✅ |
| `/no-such-route-xyz`（B4 反例） | `/workspace` | `/workspace` ✅ 回退约定未被破坏 |
| `/audit-center`（未登录态） | — | `/Login`（鉴权门控，**非**静默回退工作台） |

截图：`screenshots/mobile/audit-redaction/06-deeplink-audit-center.png`

⚠️ **E2E 操作注意**：`playwright-cli` 每次 `open` 都会**新建浏览器上下文**（登录态丢失 → 直接被踢到 `/Login`）。验证需登录的页面时，应改用**同一会话内的 `goto`**，否则会把「鉴权跳转」误判成「深链回退」。

---

## 四、控制台

```
本会话 console-*.log 中 error 行数：0
（仅有 1 条已知环境警告：Animated useNativeDriver —— RN Web 无原生动画模块，属固有，非缺陷）
```

---

## 五、截图存证

目录：`screenshots/mobile/audit-e2e/`

| 文件 | 说明 |
| --- | --- |
| `workspace.png` … `task_task-001.png`（13 张） | 13 条通过路由的落地截图 |
| `AuditCenter-inapp.png` | **应用内**进入审核中心（四栏正常渲染：待提报 13 / 待审核 4 / 审核通过 2 / 撤回审核） |
| `DEFECT-audit-center-fallback.png` | **深链失败对照**：请求 `/audit-center` 却落在工作台 |

---

## 六、如实声明的盲区

1. **仅 Web 端**：本次扫测覆盖 Expo Web 导出产物。真机（iOS/Android）的深链行为、`native-stack` 转场动画等**未验证**；
2. **手势未测**：`PanResponder` 手势（右滑等）在桌面浏览器不可靠，未纳入本轮；
3. **时刻相关值**：`/today` 的「今日到期 5 / 待我审核 4 / 临期预警 7」为**滑动窗口**计数，随运行时刻漂移 —— 本报告数字**仅在 2026-10-01 01:26–01:29 有效**；
4. **数据为 mock**（`USE_MOCK`），未接真实后端。

---

## 七、结论与建议

- **路由机制整体健康**：13/14 通过，控制台 0 error，四栏审核中心**应用内可正常渲染**；
- **唯一缺陷是增量 7 的 linking 注册遗漏**，属 **P1**（影响 Web 刷新与深链，不影响应用内主流程）；
- 建议按 §3.5 修复并补 `tests/linking.test.ts` 表项；
- **根因治理建议**：`tests/linking.test.ts` 的硬编码清单应改为**从 `MainRootStackParamList` 派生**（或加一条「每个非 modal 根栈屏必须有 linking 条目」的守卫断言），避免同类遗漏再次静默发生。
