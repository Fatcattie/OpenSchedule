# OpenSchedule 移动端 · 增量 1 交付概览

> 任务：为既有 Expo/React Native 应用补齐「事项提报 / 事项创建 / 个人计划 + 排期拖拽 / 待审详情入口」，并继续推进 PRD 中剩余的 P1/P2 需求。
> 交付日期：2026-09-27 · 工作流：增量 SOP（产品经理 → 架构师 → 工程师 → QA → 修复回路）

---

## 一、本次做了什么

| # | 用户诉求 | 结果 |
| --- | --- | --- |
| 1 | 删除 `apps/mobile/dist.bak` | 用户已手动删除；本次迭代新产生的多余构建目录已登记待清理 |
| 2 | 处理 URL 形态冗余（`/me/Profile`、`/time/Calendar` 等） | ✅ 收敛为 `/workspace`、`/today`、`/projects`、`/time`、`/me`、`/me/notification-settings`、`/me/about`；往返一致性有测试守护 |
| 3 | 继续做 PRD 里剩下的 P1/P2 需求 | ✅ `M2-P1-02` 我的提报、`M2-P1-03` 审核结果站内通知、`M2-P2-02` 提报草稿本地保存 —— **需求池 12/12 全部交付** |

同时完成了前序已启动但未落盘的 T03–T05（4 个通用组件 + 排期拖拽 + 4 个新页面 + 导航装配 + 存量页入口改造）。

---

## 二、交付内容

**新增源码 13 个**
- 工具层：`utils/permission.ts`（权限矩阵单一来源）、`utils/submission.ts`（提报状态机/落地分叉）、`utils/schedule.ts`（拖拽换算纯函数）、`utils/draft.ts`（草稿序列化）
- 组件层：`PickerSheet`（统一选择抽屉）、`DateTimeField`（日期+时间两步选择）、`ItemForm`（提报/创建共用表单骨架）、`ScheduleTimeline`（排期时间轴 + 可拖拽块 + 对齐参考线）
- hook 层：`useDragReschedule`（零第三方手势库的长按拖拽）
- 页面层：`SubmissionScreen`、`CreateItemScreen`、`PersonalPlanScreen`、`MySubmissionsScreen`

**修改源码 18 个**：类型 2、service 5、桶文件 3、数据 2、页面 4、导航 2、组件 1（`TimelineBlock` 新增可选 `delayLongPress`）

**需求池完成度**：P0 7/7 · P1 4/4 · P2 1/1

---

## 三、关键决策

1. **权限落地**：`PERMISSIONS` 映射表为单一事实来源，`can()` / `useCan()` 只读它；页面统一「**隐藏而非置灰**」，禁止手写角色判断。9 个 action key 与 PRD §3 矩阵逐项对齐。
2. **提报记录可见性**：`isSubmissionRecord(task)` 为唯一判定，8 处正式列表加守卫；提报记录审核后以 `status='cancelled'` 归档（双保险），因此**对既有 237 用例零影响**。
3. **拖拽取消规则收敛为 2 条**（上滑 ≥56px / 水平拖出时间轴），垂直越界一律钳制 —— 规则越少越好测。
4. **零新增依赖**：拖拽仅用 RN 内置 `Animated` / `PanResponder` / `LayoutAnimation`（项目铁律禁用 `reanimated` / `gesture-handler`）。
5. **演示数据补齐**：新增 2 条归属于演示账号的提报种子，使「我的提报」页不再永远为空（原先 3 条种子的 `createdBy` 都不是演示账号）。

---

## 四、验证证据

- `npx tsc --noEmit` → **0 error**（strict）
- `npx jest` → **25 套件 / 383 用例全绿**（增量前 17 套件 / 321 用例，+8 套件 / +62 用例）
- 零新增依赖：`grep reanimated|gesture-handler` 无命中
- **真实浏览器端到端**（Playwright，390×844）：13 条路由 13/13 PASS、控制台 0 错误
- **全链路跑通**：member 提报 → 待审列表新增 → manager 右滑通过 → 落地 → **站内通知「提报已通过」可见**
- **权限双向验证**：member 看不到「待我审核」/「创建事项」/项目 FAB；manager 三者正常且汇总计数一致
- **草稿持久化**：刷新页面后标题恢复 + 提示「已恢复上次未提交的草稿」
- 截图 8 张（`screenshots/mobile/13-*`、`20-*`~`26-*`）

**QA 两轮验收**：第 1 轮判 `IS_PASS: NO`（1×P1 + 2×P2）→ 修复 → 第 2 轮再发现 2 处残留 → 修复 → 主理人定向复验通过。**6 个缺陷全部关闭**。

---

## 五、主要文件

| 路径 | 说明 |
| --- | --- |
| `docs/mobile-app/DELIVERY-mobile-increment-1.md` | **增量交付总结**（需求明细 / 交付物清单 / AC1–AC10 / 验收证据 / 缺陷闭环 / 协作记录） |
| `docs/mobile-app/QA-mobile-increment-1.md` | QA 两轮验收报告（逐条验收表 + 缺陷清单 + 修复指令 + 测试盲区） |
| `docs/mobile-app/PRD-mobile-increment-1.md` | 增量 PRD（权限矩阵 / 需求池 / 提报状态机 / 拖拽交互设计） |
| `docs/mobile-app/ARCH-mobile-increment-1.md` | 增量架构（分层落点 / 文件清单 / 类图 / 时序图 / T01–T05） |

---

## 六、后续建议与遗留

1. **真机验证排期拖拽**（本增量唯一无法在浏览器完整验证的交互）：`cd apps/mobile && npm start` → Expo Go → 「我的 → 个人计划 → 排期」长按个人任务块拖动。
2. **推进 increment-2**：接通 `completeTask` → 待审核 断链（PRD §2.3 已给出改动点），让「待我审核」完全由真实操作供给。
3. **清理多余构建产物**：`apps/mobile/dist`、`dist-v2`、`dist-v3` 需手动删除（沙箱批量删除受限）；`dist-v4` 为最新产物。
