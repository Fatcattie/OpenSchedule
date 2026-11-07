# 总览 · 增量 7 + 7.1 —— OpenSchedule 移动端审核功能对标既有审核实现

> 交付总监：齐活林 · 执行团队：`software-openschedule-audit`（pm 许清楚 → architect 高见远 → engineer 寇豆码 → qa 严过关）
> 施工范围：`apps/mobile`（**不改** `apps/web` / `services/api`）
> 状态：**增量 7 已交付** · **增量 7.1 已交付并通过 QA 独立复验**

---

## 一、本次要解决什么

移动端此前**自创了一套审核设计**（甚至发明了「5 类审核标签」），但 monorepo 里 `apps/web`（审核中心）与 `services/api`（NestJS + Prisma）**早就有一套成熟的审核实现**。本次任务是把移动端**对标**到项目既有的审核实现，并按它开发。

**核心桥接策略**：移动端**不照搬** web 的 `approvalStatus` / `approvalType` 字段，而是新增**派生纯函数**（`src/utils/audit.ts`）从既有字段算出 web 语义视图。

## 二、已拍板的 11 项决策

| # | 决策 |
|---|---|
| D1 | 落点 = `apps/mobile`（不改后端 / web） |
| D2 | 范围 = 提报审核 + 完成评审 |
| D3 | 「5 类审核标签」框架**作废** |
| **D4** | 引入存储态 **`pending_review`** —— 完成提报后**不算完成**，审核通过才 `done`；**同时追加授权**修改「引入 `pending_review` 所必需」的既有断言 |
| D5 | 四栏落在**新建**的「审核中心」页（`AuditCenter` 路由） |
| D6 | 「待提报」栏照搬 web **宽口径** |
| **M1** | `needsReview = task.reviewRequired === true && task.isReviewTask !== true`（严格对齐后端 `tasks.service.ts:340`）；`reviewRequired` 由**管理员创建任务时**选择；`completeTask` **只读不改**该标志 |
| **M2** | 审批门禁落 **UI 层**（`canApproveMainTask` 禁用「通过」），服务层不加硬校验 |
| **M3** | 看板**新增「待评审」列** |
| **P1** | **保留**评审子任务向承接人发 `task.review.pending`（忠实后端） |
| **P2** | 撤回 / 撤销后「需要评审」**不再成立**（沿用移动端既有清理语义）—— ⚠️ **已知且有意**：撤回可绕过评审 |

## 三、交付内容

**增量 7（功能）**
- 新增 4 个源码文件：`src/utils/audit.ts`、`src/services/audit.service.ts`、`src/screens/AuditCenterScreen.tsx`、`src/components/AuditLogItem.tsx`
- 新增 1 个测试套件：`tests/audit-center.test.ts`
- 修改 13 个源码文件 / 10 个既有测试套件

**增量 7.1（缺陷修复 + 补欠账）**
- `src/services/task.service.ts`：文件末尾新增 `closeOpenReviewSubtasks()`（`:1415`）+ 4 处清理点调用（`moveTask:369` / `reopenTask:475` / `undoCompletion:529` / `withdrawCompletion:1105`）；C 复用过滤收紧（`:1346`）
- `src/utils/audit.ts`：E 门禁排除 `cancelled`（`:112-124`）
- `src/utils/submission.ts`：注释同步（`:189-190` / `:202-203`，纯注释零行为）
- **新增** `tests/audit-center-render.test.tsx`（T-1~T-4，补 ARCH §6-T03「组件测试通过」欠账）
- `tests/audit-center.test.ts` 追加 R-1~R-6 + S-1/S-2
- `tests/increment4-qa.test.ts`：**唯一**既有断言收窄（`:357-359` / `:373-375`）

## 四、验收结果（三重核实）

| 项 | 结果 |
|---|---|
| `npx jest --config jest.config.js` | **40 套件 / 771 用例全绿**（7.0 基线 39/759 → 7.1 基线 40/771） |
| `npx tsc --noEmit` | **零错误** |
| 零新依赖 | ✅ `package.json` 零改动；无 `reanimated` / `gesture-handler` |
| 裸 `<Pressable>` 白名单 | ✅ 仍**恰好** 6 个文件 |
| `submissionStatus =` 全文件计数 | ✅ 仍**恰 7 处**（未新增赋值） |
| `withdrawCompletion` 源码切片 | ✅ 8 个禁用串（含 `'cancelled'` / `pushNotification`）**全为 0** |
| 断言改动授权 | 7.0 = 34 条 + 2 处源码不变式 = 36 改动点；**7.1 后 = 35 条 + 2 = 37 改动点**，逐条登记于 ARCH §2.6 |
| **变异测试** | ✅ **6 / 6 全部命中** —— 逐个回退修复均有用例失败，**无用例是橡皮图章** |

> 验收数字由 **team-lead 独立复跑** + **QA 独立复现**双重确认；QA 另做变异测试与 17 例自建探针。

## 五、验证中发现并处置的问题

**7.0 阶段**
- **工程师发现（架构师与主理人都漏了）**：`createClearedReviewState()` 会清 `reviewRequired`。后端取证证明后端是**创建期持久策略位**（`tasks.service.ts:184` 只在创建时写、全仓后端从不清空）。经用户拍板 **P2 = 沿用现状**。
- **工程师纠正架构师 §2.6 的 2 条误判**：`increment2-qa.test.ts:157` / `increment5-closure.test.ts:383` 是「撤回/撤销后**再**完成」，标志已被清 ⇒ 实际落 `'done'`，**不该改**。分类 B 由 16 → 14。

**7.1 阶段（主理人复核时又发现 2 个会直接挂测试的陷阱 + 1 个新缺陷）**
- **A 评审子任务孤儿**：撤回/撤销后再完成直落 `done`，第 1 轮生成的评审子任务**永久悬空**。我取证发现**清理点是 4 处不是 3 处** —— 第 4 处 `undoCompletion:515` 走 `resolveUndoReviewReset`，**不经过 `applyClearedReviewState`**，漏掉则 QA 的复现仍挂。且「单点 `completeTask` else 分支」方案不充分。
- **陷阱 1**：`withdrawCompletion` 函数体被 **4 处**切片断言禁止出现 `'cancelled'` ⇒ 关闭逻辑必须放进**定义在 `reviewSubmission` 之后**的 helper。
- **陷阱 2**：`undoCompletion` 是双语义入口 —— 传 `submissionStatus: 'pending'` 时是**审核轮回态**（审核人必须仍看得到）⇒ **绝不可无条件关闭**，否则审批死锁。为此补了守门断言 **R-6**。
- **B** `AuditCenterScreen` 零组件级渲染测试（违反 ARCH §6-T03 自身验收标准）→ 补 `audit-center-render.test.tsx`。
- **C** `ensureReviewSubtask` 复用过滤含 `cancelled`。⚠️ **主理人的自我更正**：我起初判断「当前不可达」，**这是错的** —— 漏了「手动取消评审子任务」这条路（UI 零处引用 `isReviewTask`，子任务就是普通 `todo` 任务，而状态表允许取消）。真实可达链：完成 → 取消子任务 → 驳回 → 重新提报 ⇒ 复用已 `cancelled` 的子任务。
- **E（主理人新发现）**：`canApproveMainTask` 未排除 `cancelled` ⇒ 用户取消评审子任务后**审批永久死锁**。**C 与 E 耦合，必须同修**。
- **D 核销为非缺陷**：`deriveApprovalStatus` 的 `default → 'none'` 已把 `'withdrawn'` 正确归入「未提交」，撤回后任务正确回到「待提报」栏；`'withdrawn'` 是 INV-8 合法终态且已被既有断言保护 ⇒ 不改。

## 六、产出文档

| 文档 | 说明 |
|---|---|
| `docs/mobile-app/PRD-mobile-increment-7-audit-alignment.md` | 需求（已回填 D4/D5/D6 决议 + 作废标注） |
| `docs/mobile-app/ARCH-mobile-increment-7-audit-alignment.md` | 架构 + 任务分解 + §2.4.2 孤儿消除 + §2.4.3 C/E 耦合缺陷 + §2.6 分类 R/S/T |
| `docs/mobile-app/DELIVERY-mobile-increment-7-audit-alignment.md` | 交付说明 **v7.1（终版）**（543 行，§八 含 7.1 增补 + §8.6 QA 复验结论） |
| `docs/mobile-app/QA-mobile-increment-7-audit-alignment.md` | 7.0 QA 独立验证报告 |
| `docs/mobile-app/QA-mobile-increment-7.1-audit-alignment.md` | **7.1 QA 独立复验报告**（206 行，含 6/6 变异测试结果） |
| `docs/mobile-app/PRD-mobile-increment-6-review-framework.md` | 已补 D3 作废标注（`reviewTag` 未标注项 = 0） |
| `docs/mobile-app/class-diagram.mermaid` | **已刷新覆盖 7.1**（4601 B）：`closeOpenReviewSubtasks` 成员 + 5 条 note（helper 语义 / 4 处调用点 / C / E / 可达链前置） |
| `docs/mobile-app/sequence-diagram.mermaid` | **已刷新覆盖 7.1**（8861 B）：块①复用过滤、块②补 E、**新增块③**（孤儿消除 Route 2 + `undoCompletion` 双语义 `alt` + C/E 可达链）；顺带修掉原有 ASCII `;` 导致的解析失败 |

## 七、未决 / 后续

1. ✅ **已裁定（2026-09-29）**：`tests/increment4-qa.test.ts:358` / `:374` 的过滤收窄原超出授权范围（原授权 = 「引入 `pending_review` 所必需」），用户裁定 **接受收窄、保留孤儿修复**。R1 转为「已追认」，**孤儿修复（A / Route 2）保留**，交付**无未决授权事项**。（登记于 DELIVERY §8.3 决议记录 / §8.8）
2. ✅ **已完成（2026-09-29）**：`class-diagram.mermaid` / `sequence-diagram.mermaid` 原**未覆盖 7.1**（两图时间戳均早于 7.1 落地），用户裁定**让架构师刷新**。高见远已完成：class 图（4601 B）新增 `closeOpenReviewSubtasks` 成员 + 5 条 note（helper 语义 / 4 处调用点 / C / E / 可达链前置）；sequence 图（8861 B）修改块①复用过滤、块②补 E、**新增块③**（孤儿消除 Route 2 + `undoCompletion` 双语义 alt + C/E 可达链）。
   - **我的独立验收**：`mermaid@11 + jsdom` 自建解析器复跑 → **图块 4/4 通过**（class 1/1、sequence 3/3）；`find src tests -newermt 22:00` **命中为空**（`src/**`、`tests/**` 确未被动，基线未受影响）。
   - **顺带修掉一处既有缺陷**：原 `sequence-diagram.mermaid` 消息里用了 ASCII `;`，导致**该文件原本就无法解析**；已改全角 `；`（我用对照实验反证：含 `;` 的序列图确实 `Parse error`）。
   - **我拦下的一处精度问题**：架构师初版把 **4 处**调用点画成共同经过 `applyClearedReviewState`，而 `undoCompletion` 走的是 `Object.assign`、**4 处里只有 3 处走 helper**。已要求拆成两条消息区分并重跑解析（改后 4/4 仍通过）。
3. ✅ **已完成（2026-09-29）· 全仓图表体检**：由第 2 项延伸，我对 `docs/mobile-app/` 下**全部 8 个 `.mermaid` 文件做了完整解析扫描**（13 个图块），发现**另外 2 处历史遗留缺陷**（均非本次引入，这些图**从创建起就无法渲染**），已一并修复：
   - `class-diagram-increment-1.mermaid:31`：成员定义里的 **ASCII 花括号** `{startMin,endMin}` —— mermaid `classDiagram` **不接受** `{}`（加引号也失败）。已改全角 `｛startMin,endMin｝`，原意保留。**最小复现已定位**（对照实验：ASCII `{}` 失败、全角 `｛｝` 通过）。
   - `sequence-diagram-increment-5.mermaid:19`：消息文本里的 **ASCII `;`**（2 处）。已改全角 `；`。
   - **复扫结果：8 文件 / 13 图块 全部通过（13/13，失败 0）**。
4. **QA 的 4 项非阻塞存疑**（均建议接受现状）：①「连调两次」公开 API 不可达（已用人工重入验证幂等）；② 关闭子任务零通知（与 ARCH 一致，产品取舍）；③ 反复循环会累积 `cancelled` 行（不进看板/待办/门禁）；④ 撤回「审核轮回态」任务也会关闭子任务（语义正确）。**已按 QA 建议接受现状归档**。
5. **真实 API 契约**：后端无 approve/reject 端点，本次仅 mock + 保留 6 条 `TODO(real-api)`。
6. **`apps/mobile/dist-v4` … `dist-v14`（11 个构建目录，各 5.6M）** 待清理（历史遗留，未擅自删）。
7. ✅ **已完成（2026-09-29）· mermaid 语法守卫**：新增 `scripts/check-mermaid.mjs` + 根 `package.json` 的 `check:mermaid` 脚本，防止图表再次静默损坏。
   - **刻意不进 `tests/`** ⇒ **不改动 40 套件 / 771 用例的冻结基线**；也不往仓库写依赖（`package.json` 未新增任何 dependency）。
   - **自举式依赖**：优先用当前可解析的 `mermaid`/`jsdom`；解析不到就自动在**系统临时目录**（`%TEMP%/openschedule-mermaid-guard`）引导隔离环境并把自身复制进去执行 ⇒ 仓库 lockfile **永不被污染**。（踩坑：ESM 的裸包解析基于**导入方文件位置**而非 cwd，所以必须复制脚本本体，否则隔离环境不生效。）
   - **两级诊断**：权威判定用 `mermaid.parse()` 逐图块解析；失败时再跑静态提示，把已知陷阱**定位到行号并给出改法**（ASCII `;` → 全角 `；`；成员里的 ASCII `{}` → 全角 `｛｝`）。
   - **验收证据（双路径实跑）**：仓库全量 **8 文件 / 13 图块 13/13 通过、退出码 0**；缺陷夹具（故意植入 `;` 与 `{}`）**2/2 被捕获、退出码 1**，提示行号与夹具实际缺陷行一致。
   - 用法：`pnpm check:mermaid`（或 `node scripts/check-mermaid.mjs docs` 指定目录）。
