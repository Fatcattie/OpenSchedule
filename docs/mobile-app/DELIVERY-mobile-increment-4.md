# 交付说明（增量 4）— OpenSchedule 移动端：提报 / 审核状态机收口

> 交付人：齐活林（Qi）· 交付总监 · 日期：2026-09-27 · 交付路径：`apps/mobile`
> 基线：`PRD-mobile-increment-4.md` **v1.0** · `ARCH-mobile-increment-4.md` **v1.0** · `QA-mobile-increment-4.md`（第 1 轮）
> 上游：`DELIVERY-mobile-increment-3.md` §7（已知限制 1 / 2 / 3 条 = 本次三件事）

---

## 一、TL;DR

**新增「撤回提报」入口**，让已提交的完成提报能退出审核队列、任务回到「进行中」继续推进；并**修正详情页「重开为进行中」按钮标签与实际行为不符**的缺陷（原来点它会落到「待办」）。

- 交付状态：**✅ 可验收**（QA 判定 `NoOne`）
- 测试：`tsc` exit **0**；**33 套件 / 586 用例全绿**（基线 31 / 502）
- 浏览器 E2E：撤回链路 + 两条重开分支全部 PASS，控制台 **0 error**
- 已知问题：P0 × 0、P1 × 0、P2 × 1（**QA 自身新文件的断言 bug，第 1 轮内自修**）；P3 × 6（登记不修）
- 新增依赖：**0**

> ⚠️ **本增量原定三件事，最终只有 1 件需要写代码** —— 另两件经 PM 实读后被判定为「**不该做**」（见 §3）。这不是缩水，是**避免了两次语义退化**。

---

## 二、交付物清单

### 2.1 源码：6 改

| # | 文件 | 改动 | 行为变更 |
| --- | --- | --- | --- |
| 1 | `src/utils/submission.ts` | `isWithdrawable` 由**单主体**改为**分叉主体**（`completion` ⇒ `assigneeId ?? createdBy`；否则 ⇒ `createdBy`）；`shouldClearReviewOnLeaveDone` 上方补「**审核轮回态**」注释 | 是（修正主体错位） |
| 2 | `src/services/task.service.ts` | **新增** `WithdrawCompletionInput` + `withdrawCompletion(taskId, { version, actorId, reason? })` + `pushAudit('submission.withdraw.completion', …)` + `// TODO(real-api)` | 是（新增函数，既有函数零改动） |
| 3 | `src/services/index.ts` | 桶文件导出 `WithdrawCompletionInput` | 否 |
| 4 | `src/screens/TaskDetailScreen.tsx` | ① 新增「撤回提报」入口（**隐藏而非置灰**）+ 二次确认 `BottomSheet` + 轻提示 + `detail.refetch()`；② **`runTransition` 的 `done` 分支拆分**（见 §5） | 是 |
| 5 | `src/utils/focus.ts` | 三分组口径注释锚点（徽标 = 分组长度、头部 = 并集基数、**允许不等**、不得为相等而改分组内容） | **否（纯注释）** |
| 6 | `src/screens/TodayFocusScreen.tsx` | 同上（纯注释） | **否（纯注释）** |

### 2.2 测试：2 个新增文件

| # | 文件 | 归属 | 用例数 |
| --- | --- | --- | --- |
| 1 | `tests/increment4-withdraw.test.ts` | 工程师 | — |
| 2 | `tests/increment4-qa.test.ts` | QA 第 1 轮独立验证 | **55** |

> **既有 31 个套件的断言 100% 未被修改**（mtime 证据：施工窗口 `22:03:42`~`22:06:50`，既有套件最新 mtime 仅 `19:01:19`；内容证据：4 处红线断言逐字在位）。

### 2.3 文档

| 文件 | 版本 | 说明 |
| --- | --- | --- |
| `PRD-mobile-increment-4.md` | **v1.0** | 需求池 P0×5 / P1×3 / P2×4（登记）；AC × 14；INV × 8；裁定 R5-1~R5-10；待确认 Q5-1~Q5-7 |
| `ARCH-mobile-increment-4.md` | **v1.0** | T01~T06；K19~K26；§8 回归矩阵 **29 行覆盖 31 套件**；§10 已知限制登记 |
| `ARCH-mobile-increment-4.md` 附件 | — | `sequence-diagram-increment-4.mermaid`、`class-diagram-increment-4.mermaid` |
| `QA-mobile-increment-4.md` | 第 1 轮 | AC 14/14、INV 8/8、判定 **`NoOne`** |

---

## 三、范围裁定：为什么三件事只做了一件

| # | 原定事项 | 裁定 | 理由（PM 实读证据） |
| --- | --- | --- | --- |
| ① | **列表内容互斥**（原 Q4-12） | **不做**（Q4-12 就此闭合） | 用户可见的**错误数字已消除**（增量 3 头部改并集口径），残留的只是**徽标之和**，而徽标 = 分组长度本身**正确**。三组是**三种视角**（日历日 / 角色 / 滚动 24h），不是划分；互斥会让每个列表**不再符合自身定义** —— 「临期预警排除今日到期」会把**最紧急**的今日任务从预警里拿掉（安全退化）。且实测证明**不是包含关系而是交叉重叠**（`task-016` ∈ 今日到期\临期、`task-018` ∈ 临期\今日到期）⇒「排除被包含者」这一自然修法**根本不适用**。`dropTask` 已同时从三组移除 ⇒ 重叠**不产生任何功能缺陷** |
| ② | **非 `done` 的 `pending` 收口**（原 N2） | **不做** —— 该组合是**合法态**，PM 命名为「**审核轮回态**」 | ① 该组合由**产品自己**在「撤销审核通过」流程中写入（`TodayFocusScreen.tsx:247-257` 传 `{status:'in_progress', submissionStatus:'pending'}`）；② `resolveUndoReviewReset` 对 `'pending'` **刻意不清理**（`submission.ts:145-148`，K3），目的正是让任务**留在**审核人队列；③ 被 **4 个测试套件**保护；④ 判据的**不对称是语义正确的**：离开 `done` = 撤回完成声明 ⇒ 清理；非 `done` 的 `pending` 下任务仍在推进，离开状态不应**静默杀死一个待审提报**（否则审核人再也看不到 —— 正是 K3 要防的反向缺陷）。**推翻了增量 2 §十-2 / PRD-3 §8-9 的「缺口」措辞** |
| ③ | **「完成提报」撤回入口**（原 N1） | **做** | 原 `withdrawSubmission` 会把 `status` 置 `cancelled`（对正式任务语义错误），且其主体判据用 `createdBy` ⇒ **主体错位** |

---

## 四、核心设计（③ 撤回入口）

```
withdrawCompletion(taskId, { version, actorId, reason? }): Promise<Task>

守卫顺序（错误文案逐级区分，便于定位）
  1. assertVersion(task, version)                     ⇒ 40901（版本冲突）
  2. submissionStatus !== 'pending'                    ⇒ 40302（无待审提报可撤回）
  3. !isWithdrawable(task, actorId)                    ⇒ 40302（只能撤回本人提交的完成提报）
  4. 若 status === 'done'：
       assertTransition('done', 'in_progress')         ← 合法性由状态机保证
       status = 'in_progress'
       completedAt = null                              ← INV-1 保持
     若 status !== 'done'：**不改 status**（避免 in_progress→in_progress 非法自迁移 40902）

清理审核态（唯一构造点，禁止第二份字段清单）
  applyClearedReviewState(task)                        ← createClearedReviewState() 六字段
  再覆写 submissionStatus = 'withdrawn'

收尾
  version += 1；updatedAt = now()
  pushAudit('submission.withdraw.completion', actorId, taskId, '撤回了「{title}」的完成提报')
  **零通知**（硬约束：不得动通知系统；与 undoCompletion 零通知口径一致）
```

### 4.1 主体判定（本次修复的核心缺陷）

| | 修正前（`withdrawSubmission` 内联） | 修正后（`isWithdrawable` 分叉） |
| --- | --- | --- |
| 判据 | `task.createdBy === actorId` | `resolveApproveBranch === 'completion'` ⇒ `assigneeId ?? createdBy`；否则 ⇒ `createdBy` |
| 对 `task-014` 的后果 | **真正的提报人李娜无权撤回，从未提报的张伟却有权** | 李娜可撤回，张伟 **40302** |

> 附带修复：`isWithdrawable` 修正前是**死代码**（全仓零引用），服务层内联了**另一套**判据 ⇒ 谓词 / 实现漂移。本增量把它收敛为**单一事实来源**，并要求 `withdrawCompletion` **真正引用**该纯函数。
> `withdrawSubmission` 的既有内联判据**保留不动**（避免触碰 `submission-flow.test.ts`）⇒ 仓内仍有**两处**主体判定（已登记 §7-5）。

---

## 五、我（主理人）推翻 PM 的一处裁定

**PM 原裁定**：详情页「重开为进行中」标签与行为不符，**本次不修**（登记为 `M5-P2-02`），理由是「属**任务**状态机 UI 缺陷，不在三件事范围；修它要动 `TaskDetailScreen.tsx:129-133` 的分支，**回归面超出范围**」。

**我实读复核后认为该理由不成立，改判【纳入】，编号 `M5-P1-04`：**

| # | 我的核实 | 证据 |
| --- | --- | --- |
| 1 | **回归面其实为零** | `grep -rln "TaskDetailScreen" tests/` **零命中**；测试只覆盖**服务层** `reopenTask` / `moveTask` 本身，改 UI 分支选择**不触碰任何既有断言** |
| 2 | **正确实现已存在且被测试锁定** | `moveTask`（`task.service.ts:293-328`）对 `done → in_progress` **完全正确**；且 `tests/increment2-completion.test.ts:190-205` **已直接断言**该迁移（`done + pending`）⇒ 六字段全清 + 审计 `task.move` + 退出待审队列，**当前全绿** |
| 3 | **本增量会放大该不一致** | 新增的 `withdrawCompletion` 让任务落到 `in_progress`，而 UI 上标着「重开为进行中」的按钮却落到 `todo` ⇒ **同一语义出现两种不一致结果** |
| 4 | **是用户可见的谎言** | 按钮标签 ≠ 实际行为 |

**最小变更**：`runTransition` 的 `done` 分支拆两支 —— `action.to === 'in_progress'` ⇒ `moveTask`；`action.to === 'todo'` ⇒ 仍 `reopenTask`（**逐字节不变**）。**不动** `types/task.ts`、**不动** `reopenTask` / `moveTask` 函数体。`requireReason` **保留 UI 层必填**（不放宽）。

**架构师实读后同意纳入，并给出了更强的证据**（`increment2-completion.test.ts:190-205` 的锁定断言）。**仅 2 处非破坏性可观测差异**（已登记 §7-6）：audit `actorId` 由 `createdBy` 变为 `assigneeId ?? createdBy`；`moveTask` 会补 `startedAt ??= now()`（对已完成过的任务通常已非空 ⇒ 实际无变化）。

---

## 六、验证结果

### 6.1 静态与单测（主理人独立复跑，非采信成员陈述）

| 项 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **exit 0** |
| `npx jest --config jest.config.js` | **33 套件 / 586 用例全绿**（`Time: 49.69 s`） |
| 基线对比 | 增量 3 交付态 31 / 502 → 本增量 **+2 套件 / +84 用例** |
| 禁用依赖 | `grep -rn "reanimated\|gesture-handler" src/` → **无命中** |
| 新增依赖 | **0** |

### 6.2 浏览器端到端验收（`dist-v7` @ `http://127.0.0.1:4176`）

> 运行时刻：**2026-09-27 约 22:20~22:26（Asia/Shanghai）**，登录角色 **张伟（管理人员 / manager）**。
> 样本选择：`task-006`（「接口联调环境」，`in_progress`，**负责人 = 张伟**）⇒ 完成提报后**提报人即张伟本人**，可走通「撤回」正向链路。

| 步骤 | 实测 | 结论 |
| --- | --- | --- |
| 完成前 | 动作 = 退回待办 / 标记完成 / 标记阻塞 / 取消任务；**无「撤回提报」** | ✅ 门禁正确（`submissionStatus` 为 `null` 时不渲染） |
| 完成提报后 | 状态 = **已完成 / 待审核**；动作 = 重开为待办 / 重开为进行中 / **撤回提报** | ✅ 入口出现 |
| 点「撤回提报」 | 二次确认 Sheet：「撤回后该完成提报将退出审核列表，任务回到**「进行中」**继续推进，确定撤回吗？」 | ✅ 文案与实际行为一致 |
| 确认撤回 | 状态 = **进行中**（**不是「待办」**）；**待审核标签消失**；动作回到 退回待办 / 标记完成 / … ；**「撤回提报」消失** | ✅ 撤回成功，INV-1 / INV-4 保持 |
| **「重开为进行中」（修复验证）** | 完成后再点 ⇒ 落点 = **进行中** | ✅ **修复生效**（修复前必落「待办」） |
| **「重开为待办」（对照组）** | 落点 = **待办** | ✅ 该分支**未被改动** |
| `requireReason` | 两条重开路径均弹「重开需填写原因（不少于 4 个字符）」 | ✅ UI 层必填**未放宽** |

**控制台**：本次会话日志仅 2 条（1 条既有 `useNativeDriver` WARNING + 1 条 DOM VERBOSE），**0 error**。

### 6.3 QA 智能路由

| 项 | 结果 |
| --- | --- |
| 判定 | 🟢 **`NoOne`** |
| AC / INV | **14/14**、**8/8** |
| 源码缺陷 | **零** |
| 对抗性用例 | 主体**双向对照**（李娜 `user-002` 成功 / 张伟 `user-001` → 40302 且零副作用）；重复撤回 → 40302；**零通知**（`db.notifications` 逐字节相等）；非 `done` 分支 **status 仍 `in_progress`**；INV-1 全量遍历零违例；六字段清理用「手工置非空再撤回」**强证明**；`task`/`project` 分支主体仍为 `createdBy` |
| 唯一红过的用例 | **QA 自身新文件的断言过严**（`reviewRequired: false` 在 `submission.ts` 合法出现 2 次），**第 1 轮内自修闭环**，未使用第 2 轮配额 |

---

## 七、已知限制（本次不做，已登记）

| # | 限制 | 登记处 |
| --- | --- | --- |
| 1 | **撤回不发通知** —— 审核人的「待我审核」条目会**静默消失**（可能已收到过 `review.pending` 通知）。缓解：撤回后任务回到正式列表，点击原通知仍能看到真实状态 ⇒ 不产生错误决策 | PRD §9-1 / ARCH §10-1 |
| 2 | **`SUBMISSION_TRANSITIONS` 仍是死表且与真实行为冲突** —— 全仓无运行时调用；表内 `approved: []` 与产品的 `approved → pending` 矛盾、缺 `rejected → pending`。被 `submission-flow.test.ts:76` 锁定 ⇒ **本次不得改表**；**该表不是行为契约，勿据其推断运行时可写入集合** | PRD §9-2 / K23 |
| 3 | **`listTodayDue` 排除 `pending` 与审核轮回态语义冲突** —— 审核轮回态任务（仍在推进）从「今日到期」消失却留在「临期预警」。增量 3 已登记为**有意差异**，本次沿用不改 | PRD §9-4 / Q5-5 |
| 4 | **撤回对 `blocked` 来源的任务会解除阻塞** —— `blocked → done` 合法，但 `blocked` 不可从 `done` 到达 ⇒ 撤回后落 `in_progress`，阻塞标记丢失（与既有「撤销完成」降级约定一致） | PRD §9-5 |
| 5 | **仓内仍有「两处」撤回主体判定** —— `isWithdrawable`（已修正）与 `withdrawSubmission` 的内联判据（保留不动）。对「提报记录」二者语义等价，无正确性缺口 | ARCH §10-9 / K20 |
| 6 | **`done → in_progress` 的两处可观测差异** —— audit `actorId` 由 `createdBy` 变为 `assigneeId ?? createdBy`（无断言覆盖）；`moveTask` 补 `startedAt ??= now()` | ARCH §10-12 |
| 7 | **`withdrawSubmission` 对正式任务仍会写 `cancelled`（潜伏）** —— 当前唯一调用点数据源已按 `isSubmissionRecord` 过滤 ⇒ **不可达**；建议下一增量加守卫 | PRD `M5-P2-04` |
| 8 | **手势盲区** —— 右滑卡片在桌面浏览器不可靠复现，需真机手测（⚠️ 注意假阳性：动作按钮始终存在于 DOM，只是被卡片盖住，**必须看截图**） | 沿用增量 3 声明 |

---

## 八、给用户的下一步建议

1. **浏览器验收**：`http://127.0.0.1:4176/`（**增量 4 最新产物 `dist-v7`**）—— 演示账号 `zhangwei@example.com / openschedule`。
   - 正向链路：工作台「我的待办」→「接口联调环境」→「标记完成」→ 出现**「撤回提报」** → 撤回后回到「进行中」。
   - 修复验证：任一已完成任务 → 「重开为进行中」应落**「进行中」**（修复前落「待办」）。
2. **对照旧版**：`4175` = 增量 3（`dist-v6`）、`4174` = 增量 2（`dist-v5`）、`4173` = 增量 1（`dist-v4`）—— **四个端口并行存活**。
3. **真机手测**：右滑卡片手势请在真机 / 模拟器复验（桌面浏览器为已知盲区）。
4. **目录清理**：`apps/mobile/dist-v4` ~ `dist-v6` 在不需要对比后可手动删除（受沙箱批量删除守卫限制，我未自动清理）。
5. **后续增量候选**：① 通知系统**小**收口（⚠️ **已勘误重新定级**：`task.completed` / `review.result` 的 label+icon 映射**其实都已存在**，**不存在**静默降级 —— 真正的缺口只有 `domain.ts:98` 的**类型注释**陈旧 + 通知偏好种子未登记这两个小问题，见 `DELIVERY-mobile-increment-3.md` §7-4 勘误）；② §7 的 `SUBMISSION_TRANSITIONS` 收口为真守卫 + `withdrawSubmission` 加守卫 + 撤回通知（三者同属「提报状态机」收口）；③ 基础 PRD 剩余 P1/P2（离线态与错误态、深色模式、时间容器月视图、多语言）。
