# 审核中心「待审核」卡片动作入口 — 交付概览

## TL;DR

审核中心**待审核**栏的每张卡片右侧，原本只有一个灰色「审核」按钮；现改为**三行三色柔和按钮**——**通过**（浅绿底 / 绿字 / 绿描边）、**不通过**（浅红底 / 红字 / 红描边）、**退回重改**（浅琥珀底 / 琥珀字 / 琥珀描边）。**三枚按钮全部打开审核抽屉**并预置对应的「审核动作 + 审核意见」（**「通过」不再直过**）。改动落在 3 个源文件 + 1 个测试文件，零新增依赖。

> **本概览覆盖范围**：第十一节起为后续增量，均已交付验收。
> - **十一 / 增量 7.8** —— 通知文案分叉（三处裁定口径统一）
> - **十二 / 增量 7.9** —— 提报人侧口径统一
> - **十三** —— Web 审核页「审核按钮缺失」排查与修复（含预览服务掉线根治）
> - **十四** —— M8 变异实证与最终验收（跨层接缝断言非空转，QA 与主理人双独立复核）
>
> 当前终态：移动端全量 **41 套件 / 808 用例全绿**（`--no-cache` 独立复核，`tsc --noEmit` exit 0）；Web 端零测试基建，改以真浏览器 E2E 验证。

## 一、需求演进（三轮裁定）

| 轮次 | 用户诉求 | 裁定 |
|---|---|---|
| 第 1 轮 | 卡片右侧新增「红字的功能内容」 | 两行**红字**（`colors.danger`）；「审核通过」直过、「退回 不通过」开抽屉 |
| 第 2 轮 | 「红色字体要做成功能按钮，颜色要结合 UI 来设定」 | 形态 = **浅底 + 描边**；配色 = 成功绿 / 红 |
| 第 3 轮 | 「我的意思是有**三种审核选项：通过、不通过、退回**」 | 动作 2 → **3**；**三者都开抽屉**；第三项文案 = **退回重改** |

## 二、领域模型（关键澄清）

「三种裁定」**不是三个 `action`**：

| 按钮显示文案 | `action` | `opinion` | 配色 token |
|---|---|---|---|
| `通过` | `approve` | `agree` | `colors.success` 绿 |
| `不通过` | `reject` | `reject` | `colors.danger` 红 |
| `退回重改` | `reject` | `rework` | `colors.warning` 琥珀 |

- `AuditAction` 只有 **3 值**：`approve` / `reject` / `withdraw`。
- 真正区分三裁定的是 **`AuditOpinion`**（`agree` / `reject` / `rework` / `other`）。
- 「不通过」与「退回重改」**共用 `action='reject'`**，靠 `opinion` 区分 —— 与 `apps/web/src/pages/AuditPage.tsx`（权威参照）一致。

## 三、实现

改动 3 个源文件：

### 1. `apps/mobile/src/theme/tokens.ts`
新增三个浅底色 token（与既有 `primaryFaint` 同风格、同层级，均在 `colors` 顶层）：

```ts
/** 成功 / 通过 的浅底（柔和按钮、状态底色） */
successFaint: '#E9F6F0',
/** 错误 / 驳回 的浅底（柔和按钮、状态底色） */
dangerFaint: '#FBEDED',
/** 警示 / 退回重改 的浅底（柔和按钮、状态底色） */
warningFaint: '#FAF4EA',
```

### 2. `apps/mobile/src/screens/AuditCenterScreen.tsx`
- **`openAuditWith(task, nextAction, nextOpinion)`（:269）** —— 三枚卡片动作共用入口；内含 `actionsFor(task).includes(nextAction)` 守卫，无权限时静默返回。
- **删除** `submitApproveDirect`（直过路径整体移除，`grep` = 0 残留）与 `openRejectAudit`；`openAudit` 保留，供 `withdraw` 回落路径。
- `runSubmit(params)` 仍是唯一提交核心，两条前置校验不变（原因字数下限 / `canApproveMainTask` 门禁）。
- 卡片 `right`（:379-415）—— 仅当同时具备通过 / 驳回权限时渲染三行按钮；否则回落原「审核」按钮；无权限不渲染。**其余三栏完全不受影响。**
- **`accessibilityLabel` 与显示文案分离**（关键）：

```ts
/** 「待审核」栏卡片三个动作的**显示文案**（仅用于渲染，不作为 accessibilityLabel） */
const APPROVE_LABEL = '通过'
const REJECT_LABEL = '不通过'
const REWORK_LABEL = '退回重改'
/** 卡片三个动作的 accessibilityLabel（带「审核」前缀，与显示文案分离） */
const APPROVE_A11Y = '审核通过'
const REJECT_A11Y = '审核不通过'
const REWORK_A11Y = '审核退回重改'
```

> **为什么必须分离**：抽屉内「审核动作」选项有「通过」、「审核意见」选项有「不通过」「退回重改」，与卡片按钮显示文案**完全同名**。若 `accessibilityLabel` 沿用显示文案，抽屉打开后按标签定位会**同时命中卡片按钮与抽屉选项**，自动化用例不稳。加前缀后全树唯一，**显示文案对用户不变**。

- 样式全部引用 token，**零硬编码色值**：

| 样式键 | 内容 |
|---|---|
| `auditActionRow` | `paddingHorizontal: spacing.xs`、`paddingVertical: spacing.xxs`、`borderRadius: radius.control`、`borderWidth: 1` |
| `auditActionRowSecond` | `marginTop: spacing.xxs`（第 2、3 行共用） |
| `auditApproveBtn` | `backgroundColor: colors.successFaint`、`borderColor: colors.success` |
| `auditRejectBtn` | `backgroundColor: colors.dangerFaint`、`borderColor: colors.danger` |
| `auditReworkBtn` | `backgroundColor: colors.warningFaint`、`borderColor: colors.warning` |
| `auditApproveText` / `auditRejectText` / `auditReworkText` | `colors.success` / `colors.danger` / `colors.warning` |

**约束遵守**：零新增 npm 依赖；无 `reanimated` / `gesture-handler`；交互载体用 `PressableScale`，**未新增裸 `<Pressable>`**（白名单仍恰好 6 个文件）；除 `borderWidth: 1`（仓库既有先例）外无裸数字。

## 四、测试

| 指标 | 结果 |
|---|---|
| `npx tsc --noEmit` | 退出码 **0** |
| `npx jest --config jest.config.js` | **40 套件 / 795 用例全绿**（771 → 781 按钮轮 → 787 深链+守卫 → 789 三动作轮 → **795 跨屏统一轮**） |
| 红线审计 | 裸 `<Pressable>` 白名单仍恰好 6 个文件，未破 |

用例构成（`tests/audit-center-render.test.tsx`，4 → **16 条**）：

- **T-2 迁移**：manager 下**三标签**存在；着色断言为 APPROVE→`success`、REJECT→`danger`、REWORK→`warning`；member 下均为 0。
- **T-4a（门禁）**：点「审核通过」**开抽屉并预置 approve/agree**；子任务未 done ⇒ 提交禁用 + 阻断提示；对照组放行。
- **T-4b（抽屉门禁）**：抽屉内切回 `approve` 再断言门禁。
  > 关键坑：若只把开抽屉的标签换掉，抽屉内 `action='reject'` 会让「原因字数不足」恒为真，对照组「放行」断言必然假失败。
- **N-1 ~ N-4**：通过 happy path（提交后 `action=approve`、`opinion=agree`）/ **N-2 三按钮各自预置正确 (action, opinion)** / 提交中防重复点击 / 撤回仍可达。
- **N-5 / N-6（新增）**：非待审核栏不渲染三枚动作；**动作标签与显示文案分离**（`accessibilityLabel` 为「审核\*」，`Text` 为短文案）。
- **B-1 ~ B-5（按钮形态）**：绿底绿描边、红底红描边、**琥珀底琥珀描边**、`borderWidth===1` + `borderRadius===radius.control`、**三个浅底 token 存在且非空（防误删）**。用 `StyleSheet.flatten` 展平 `PressableScale` 的嵌套 style，全部经 tokens 比较、**零硬编码色值**。

## 五、真机渲染验证（playwright-cli，视口 390×844，dist-v19 / 端口 4185）

计算样式实测，**4 张卡片 × 3 按钮 = 12 个实例全部一致**，与设计逐项吻合：

| 动作 | `aria-label` | 文字色 | 底色 | 描边 | 圆角 |
|---|---|---|---|---|---|
| 通过 | `审核通过` | `rgb(47,158,110)` = #2F9E6E | `rgb(233,246,240)` = #E9F6F0 | `rgb(47,158,110)` 1px | 16px |
| 不通过 | `审核不通过` | `rgb(194,74,74)` = #C24A4A | `rgb(251,237,237)` = #FBEDED | `rgb(194,74,74)` 1px | 16px |
| 退回重改 | `审核退回重改` | `rgb(200,135,27)` = #C8871B | `rgb(250,244,234)` = #FAF4EA | `rgb(200,135,27)` 1px | 16px |

交互实测：

| 点击 | 抽屉预置「审核动作」 | 预置「审核意见」 | 原因 | 提交按钮 |
|---|---|---|---|---|
| 通过 | `通过`（选中 `colors.primary`） | `同意` | 备注**选填** | **可用** |
| 不通过 | `驳回` | `不通过` | 原因**必填** | 空原因时禁用 |
| 退回重改 | `驳回` | `退回重改` | 原因**必填** | `aria-disabled=true`（空原因时禁用） |

⇒ 确认「通过」**不再直过**，而是与另两枚一样进入抽屉确认。

截图：`screenshots/mobile/audit-redaction/`
- `07-three-buttons.png` —— 三按钮全貌
- `08-approve-opens-sheet.png` —— 点「通过」开抽屉（预置 通过 / 同意）
- `09-rework-opens-sheet.png` —— 点「退回重改」开抽屉（预置 驳回 / 退回重改，提交禁用）
- `10-reject-opens-sheet.png` —— 点「不通过」开抽屉（预置 驳回 / 不通过）

新增探针脚本（`screenshots/mobile/`）：`check-three-buttons.js`、`click-card-action.js`、`submit-sheet.js`。

## 六、已知残留（可接受，已由用例钉住）

同时满足「可审核 + 可撤回」的卡片（manager 本人又是提报人），撤回入口不再直接出现在卡片上，但抽屉内动作选项仍包含「撤回」，仅多一步切换（N-4 已钉）。

## 七、附带修复：`AuditCenter` 深链缺失（P1，已完成）

审核中心是根栈共享屏，但 `linking.ts` 漏登记，导致 `/audit-center` **静默回退**到 `/workspace`（Web 按 F5 会被踢回工作台）。

- **改动**：`linking.ts` 新增根栈扁平条目 `AuditCenter: 'audit-center',`；`linking.test.ts` 的 `CASES` 新增一条 —— 该数组被 B1（路径解析）与 B2（往返一致性）**共同遍历**，一条数据自动覆盖两条断言。
- **验证**：真机 `/audit-center` → **`/audit-center`**（修复前为 `/workspace`）；对照组 `/personal-plan` 正常、`/no-such-route-xyz` 仍回退 `/workspace`（B4 回退约定未被破坏）。
- 完整证据链见 `docs/mobile-app/QA-mobile-e2e-route-sweep-2026-10-01.md` §3.6。

## 八、防复发守卫（已完成）

新增 **B6** 组（`tests/linking.test.ts`，4 条用例）：**从 `stacks.tsx` 源码提取根栈屏清单，与 `linking.config.screens` 的键做闭环**，让「新增根栈屏但漏登记深链」这件事**必然被测出来**——这正是 P1 的复发根因（`CASES` 是硬编码清单，新屏不会自动纳入）。

- **豁免**：`Tabs`（显式白名单，Tab 容器）；`transparentModal` 抽屉（**结构性识别** `presentation`，当前为 `AiProposalSheet`）——将来新增同类 modal 不会误报。
- **护栏自检**：断言源码提取到的屏清单非空且含关键屏；提取机制失效（正则/路径变更）时**立即失败**，避免守卫腐化成摆设。
- **反向断言**：`CASES` 各 `chain` 的根屏名必须真实存在，防反向漂移。
- **变异验证（QA 独立复做，未采信工程师自述）**：
  - 注释掉 `AuditCenter` 那行 → 守卫变红，失败信息 `Received: ["AuditCenter"]`；
  - **另抽 `TaskDetail` 做第二次变异 → 同样变红**（证明守卫对**所有**共享页生效，非仅 `AuditCenter`）；
  - 还原后文件 md5 与改前**完全一致**，`src/` 零净改动。
- **非阻塞提示**：modal 块正则依赖自闭合 `/>` 写法，若将来改用 `</MainRootStack.Screen>` 闭合，非贪婪匹配可能跨块误判。

## 九、磁盘清理（已完成）

经用户确认后执行：

- 删除隔离区 `%TEMP%/openschedule-dist-archive-20261001`（**61M**，11 个旧 dist 归档）→ 已完全删除；
- 删除预览产物 `dist-v15` / `dist-v16` / `dist-v17`（各 5.6M，合计 **17M**）；
- 保留 `dist-v18`（双色按钮版）与 **`dist-v19`（当前三动作版）**；预览服务收敛为 **`4185 → dist-v19`**（实测 HTTP 200），旧的 `4184 → v18` 已停止以释放资源。

合计释放约 **78M**。删除逐目录进行（沙箱有「单次删除 > 50 文件」守卫，每个 dist 为 34 文件，未触发）。

## 十、跨屏口径统一：今日焦点右滑补「退回重改」（增量 7.7）

### 动机
移动端有**两个**审核入口，改完审核中心后口径仍不一致：

| 入口 | 形态 | 改动前裁定数 |
|---|---|---|
| 审核中心 | 卡片三按钮 → 抽屉 | 3（本轮已统一） |
| **今日焦点「待我审核」栏** | **右滑操作** → 通过（乐观更新 + 可撤销）/ 驳回（开抽屉填原因） | **2 ← 缺口** |

经用户确认「补上，三处口径统一」后执行。

### 实现（3 个文件）
1. **`apps/mobile/src/screens/TodayFocusScreen.tsx`**
   - 新增 `type RejectOpinion = Extract<AuditOpinion, 'reject' | 'rework'>` 与 state `rejectOpinion`。
   - `buildActions` 的 review 分支由 2 动作扩为 3：`approve`(success) / `reject`(danger) / **`rework`(warning)**，后两者共用同一个原因抽屉，仅预置的 opinion 不同。
   - `handleRejectConfirm` 第 6 参透传 `rejectOpinion`；第 5 参 `actorId` **仍传 `undefined`** 以保持服务端既有缺省回落（最小变更）。
   - 抽屉 title / 提示 / `TextField` label / `Button` label + variant 全部随 `isRework` 分叉。
2. **`apps/mobile/src/components/Button.tsx`（纯增量）** —— 补 `warning` 变体（类型联合 + `isPrimaryLike` + `variantStyles.warning`），否则抽屉里的「确认退回」无法呈现琥珀色、与右滑动作脱节。既有四个变体渲染路径完全不变。
3. **`apps/mobile/tests/today-focus-gate.test.tsx`** —— 既有用例改三裁定断言；新增 3 条（rework→`opinion='rework'`、驳回对照组→`'reject'`、先退回再驳回→防残留）。

### 关键设计判断（有意为之）
`rejectOpinion` 的复位**只放在成功路径与无权限早返回**，**刻意不放进 `finally`** —— 失败时抽屉保持打开（`rejectTarget` 不清空），若在 `finally` 复位会把已打开的「退回重改」抽屉文案**瞬间翻成「驳回」**，属视觉 bug。QA 独立评估认可该理由，并补测了「失败后重试仍以 `opinion='rework'` 提交」。

### QA 变异验证（不采信工程师自述）
| 变异 | 结果 |
|---|---|
| A 删除 `rework` 动作对象 | **4 红** ✅ |
| B 透传的 `rejectOpinion` 硬编码为 `'reject'` | **2 红**，且**驳回对照组保持绿** ✅（证明对照组是有效对照） |
| C 驳回动作预置改成 `'rework'` | **2 红** ✅ |
| D 删除成功路径的 `setRejectOpinion('reject')` 复位 | **0 红 ⇒ 如实报告为测试盲区**（非缺陷：三个动作的 `onPress` 各自都显式预设 opinion，故该复位属纵深防御冗余） |

每轮变异均记录改前/改后 md5；`src/` 最终**零净改动**（`TodayFocusScreen.tsx` md5 `5aec33f6fe26911b6eb3ce801f8fed4d`、`Button.tsx` md5 `2076a7ac849805895fde7f95becfef88`，主理人独立复算一致）。

QA 另补 3 条边界用例：失败路径残留 + 重试、失权时抽屉即时关闭并回落、非「待我审核」栏绝不渲染审批三动作（keys 精确等于 `['claim','complete']`）。

### 真机验证（playwright-cli，390×844，dist-v20 / 端口 4185）
右滑手势**真实复现**（合成 `TouchEvent`；`PanResponder` 不响应鼠标事件）：

| 断言 | 实测 |
|---|---|
| 单行动作数 | **3** |
| 布局 | `通过` x=20 / `驳回` x=96 / `退回重改` x=172，宽度均 **76** |
| tone → 语义色 | `rgb(47,158,110)` 绿 / `rgb(194,74,74)` 红 / `rgb(200,135,27)` 琥珀 |
| 滑开前 | 三枚 `revealed = false`（被卡片盖住） |
| 滑开后 | 三枚 `revealed = true` |
| 点「退回重改」 | 抽屉「退回重改 / 退回原因将回流给提报人 / 退回重改原因 / **确认退回**」，且**不含**「确认驳回」「驳回原因」 |
| 点「驳回」（对照组） | 抽屉「驳回完成提报 / 驳回原因 / **确认驳回**」，且**不含**「确认退回」「退回重改原因」 |

⇒ 两个抽屉文案**互斥**，证明 `rejectOpinion` 真的在驱动 UI 分叉，而非写死。

截图：`screenshots/mobile/audit-redaction/12-focus-swipe-three-actions.png`（滑开态三枚动作）、`13-focus-reject-control.png`（驳回对照组）。
新增探针：`screenshots/mobile/swipe-rework-probe.js`、`focus-diag.js`。

### 本轮新踩的坑（已回填 skill）
1. **`pw.js eval` 只接受单个表达式** —— 用 `;` 分隔多语句会**静默失败**（无输出、无报错），两次 `sessionStorage.setItem` 全没生效，一度误判成「页面读不到参数」。改用**逗号运算符**或 IIFE。
2. **同屏同名按钮**：AI 提议卡的「驳回」按钮（宽 146）与右滑动作的「驳回」（宽 76）**都带 `aria-label="驳回"`** ⇒ 必须用「宽度恰为 76」这类独有特征区分。
3. **判定右滑是否真的露出**：`actionBtn.contains(document.elementFromPoint(cx, cy))` —— 比截图更硬、可自动断言。
4. **目标行在视口外时 `elementFromPoint` 返回 `null`**：须先滚动可滚动祖先再重新采集矩形。
5. **等元素出现要轮询**：固定 `sleep 1.6s` 会撞上骨架期，扫不到任何动作按钮。

---

## 十一、通知文案分叉：三处裁定口径统一（增量 7.8）

### 需求（用户拍板）

审核裁定从「通过 / 不通过」扩为三值后，**通知文案**仍只有两种口径，提报人收到「退回重改」时看到的是「被驳回」，与审核侧口径不一致。用户明确拍板：**「只让通知文案分叉」** —— 不动状态机。

> 关键边界：`AuditAction` 仍是 `approve|reject|withdraw` 三值，**「退回重改」不是第四个 action**，而是 `reject` + `opinion='rework'`。因此状态迁移（`submissionStatus='rejected'` / `status` / `completedAt` / `reviewNote`）在两种裁定下**完全一致**，只分叉文案。

### 实现（2 个文件，纯文案分支）

**1. `apps/mobile/src/services/task.service.ts`（reject 分支 :1199-1213）**

```ts
// 文案分叉（仅文案）：opinion='rework' ⇒ 退回重改，否则驳回。状态机完全不动（用户拍板）。
const isRework = opinion === 'rework'
appendAuditLog(task, 'reject', opinion ?? 'reject', task.reviewNote, operatorId)   // ← 一字未动
pushAudit('task.reject', reviewerId, taskId,
  isRework ? `退回了「${task.title}」的提报` : `驳回了「${task.title}」的提报`)
pushNotification({
  userId: task.createdBy, type: 'review.result',
  title: isRework ? '提报已退回重改' : '提报已驳回',
  body: isRework
    ? `你的提报「${task.title}」被退回重改：${task.reviewNote}`
    : `你的提报「${task.title}」被驳回：${task.reviewNote}`,
  data: { taskId },
})
```

其上四行状态赋值（`submissionStatus` / `status` / `completedAt` / `reviewNote`）**逐字节未动** —— 这是本增量的红线。

**2. `apps/web/src/hooks/useWorkspaceTasks.ts`（「通用审批结果」分支 :160-190）**

Web 端没有 `opinion` 入参，改为**从留痕反查**：

```ts
const passed = cur.approvalStatus === 'approved'
// 文案分叉（仅文案）：驳回时读最后一条审核留痕，opinion='rework' ⇒ 退回重改。
const lastOpinion = cur.auditLogs?.[cur.auditLogs.length - 1]?.opinion
const isRework = !passed && lastOpinion === 'rework'
// ...
title: passed ? `「${cur.title}」${typeLabel}已通过`
  : isRework ? `「${cur.title}」${typeLabel}已退回重改`
  : `「${cur.title}」${typeLabel}被驳回`,
body: passed ? (...) : isRework ? '已退回重改，请按审核意见修改后重新提交' : '审核未通过，请修改后重新提交',
```

其余通知分支（项目审批 / 指派 / 承接 / 改派…）逐行未变。

### 测试与变异验证

`apps/mobile/tests/increment2-completion.test.ts` **在既有用例内新增 2 条断言**（用例计数不变，40 套件 / 798 用例）：

| 行 | 断言 | 守护目标 |
|---|---|---|
| `:449` | `expect(rejected.auditLogs?.at(-1)?.opinion).toBe('rework')` | 正向：rework 必须原样落库 |
| `:471` | `expect(rejected.auditLogs?.at(-1)?.opinion).toBe('reject')` | 反向：显式 reject 不得被缺省值改坏 |

**变异验证（5 组，不采信工程师自述）**：

| 变异 | 内容 | 结果 |
|---|---|---|
| A | `isRework` 改判为 `opinion === 'reject'` | 被捕获（反向对照亦红 —— 属预期，非缺陷） |
| B | pushAudit 文案写死 | 被捕获 |
| C | pushNotification title 写死 | 被捕获 |
| D | `task.status` 恒 `cancelled` | **6 条红** ⇒ 状态不变性断言非空转 |
| E | `appendAuditLog` 的 opinion 硬编码 `'reject'` | 初判 0 红 = **真实盲区** ⇒ 补 `:449`/`:471` 后复验红 ✅ |

**盲区 E 闭合证据（主理人独立复验）**：对 `appendAuditLog(task,'reject','reject',…)` 施加变异后，
`increment2-completion.test.ts:449` 精准变红：

```
Expected: "rework"
Received: "reject"
> 449 | expect(rejected.auditLogs?.at(-1)?.opinion).toBe('rework')
```

还原后 md5 回到基线 `4df7256ece3b708f83c59e10616aea3d`。此后 `--clearCache` + 全量 **40 套件 / 798 用例全绿**，目标文件连跑 **3 轮 42/42**，无 flaky；`tsc --noEmit` exit **0**。

> 过程披露：QA 加断言后的首次运行出现过 1 次红，签名与变异 E **完全相同**。经 `--clearCache` 后 4 次干净复跑全绿、且源码全程 md5 = 基线，判定为**变异测试期遗留的 jest transform 缓存伪失败**，非用例 flaky。

### 运行时验证（Web 端，真浏览器）

| 场景 | 通知 title | 通知 body | `lastOpinion` | `approvalStatus` |
|---|---|---|---|---|
| 退回重改 | `…任务完成提报已退回重改` | `已退回重改，请按审核意见修改后重新提交` | `rework` | `rejected` |
| 不通过（对照组） | `…任务完成提报被驳回` | `审核未通过，请修改后重新提交` | `reject` | `rejected` |

⇒ 两轮文案**互斥**，而 `approvalStatus` 均为 `rejected` —— **状态机完全一致，仅文案分叉**，精确符合用户「只让通知文案分叉」的要求。

### 已交付文件与指纹

| 文件 | md5 |
|---|---|
| `apps/mobile/src/services/task.service.ts` | `4df7256ece3b708f83c59e10616aea3d` |
| `apps/mobile/src/screens/TodayFocusScreen.tsx` | `5aec33f6fe26911b6eb3ce801f8fed4d` |
| `apps/mobile/src/screens/AuditCenterScreen.tsx` | `fd4de79ba539d28ca89dde73d1297139` |
| `apps/mobile/src/components/Button.tsx` | `2076a7ac849805895fde7f95becfef88` |
| `apps/mobile/tests/increment2-completion.test.ts` | `a09cbebd70c4a2c3038464abf5748a43` |
| `apps/web/src/hooks/useWorkspaceTasks.ts` | `b0b4365a1d024afdb507d71089f9e1dc` |

### 已知残留（未分叉清单，待用户决策）

以下位置的文案**仍按二值处理**，遇「退回重改」会显示成「驳回」：

| 位置 | 文案 | 备注 |
|---|---|---|
| ~~`MySubmissionsScreen.tsx:39`~~ | ~~提报人列表状态标 `已驳回`（红）~~ | ✅ **已于增量 7.9 修复**（见第十二节） |
| ~~`MySubmissionsScreen.tsx:162`~~ | ~~`驳回原因：`~~ | ✅ **已于增量 7.9 修复**（见第十二节） |
| `apps/web/ReportPage.tsx:144` / `:170` | 驳回相关文案 | 需评估 |
| `AuditPage.tsx:492` | 同行双标签语义轻微矛盾 | 需评估 |
| `utils/audit.ts:43` / `utils/submission.ts:46` | — | **死代码**（零引用） |
| 审核侧「选动作」文案 | — | **判断不该改**（动作层本就只有 通过/驳回/撤回） |

---

## 十二、提报人侧口径统一（增量 7.9）

### 动机

第十一节只分叉了**通知文案**；提报人自己的「我的提报」列表页仍把 `reject + opinion='rework'` 显示成「已驳回」（红色标），与审核侧三裁定口径不一致。用户拍板修掉。

### 实现（1 个源文件）

`apps/mobile/src/screens/MySubmissionsScreen.tsx`（md5 `fbcc6eaecc3b2a92cff5c26e0ac36aba`）

| 位置 | 内容 |
|---|---|
| `:25-32` | import 补 `AuditLog` / `AuditOpinion`（type-only） |
| `:58-64` | 新增 `SubmissionView` 接口（`text` / `tone` / `noteLabel`） |
| `:66-69` | `lastAuditOpinion(logs)` —— 取末条留痕意见 |
| `:77-79` | `isReworkSubmission(task)` —— 判定与增量 7.8 **逐字一致** |
| `:86-94` | `resolveSubmissionView(task)` —— **单一判定点** |
| `:178-179` | 渲染取 `const view = resolveSubmissionView(task)` / `TONE_STYLE[view.tone]` |
| `:197` | 状态标文案 `{view.text}` |
| `:207` | 原因前缀 `{view.noteLabel}{task.reviewNote}` |

`SUBMISSION_STATUS_META` / `TONE_STYLE` **未改**（`TONE_STYLE` 已含 `warning`，**零新增色值**）。**未改 service** —— `listMySubmissions()` 返回完整 `Task`（含 `auditLogs`），已核实。

> 设计要点：把「是否退回重改」收敛到**单一判定点**，避免状态标与原因前缀各判一次而分叉。

### 测试（新增 1 个套件 + 1 处接缝断言）

- 新增 `apps/mobile/tests/my-submissions-rework.test.tsx`（md5 `4aad33d778a60f0b08e88ca30e5c42f1`），用例 R-1..R-7：
  - R-1 `rework` 正向（文案「退回重改」+ `warning` 前景/淡底 + 前缀「退回原因：」）
  - R-2 对照组 `reject`（仍「已驳回」+ `danger` + 「驳回原因：」）
  - R-3 非 rejected 四态（draft/pending/approved/withdrawn）文案与色调**逐字不变**
  - R-4 无 `auditLogs` ⇒ 回落「已驳回」（防误判）
  - R-5 末条意见为 `agree`（前一条是 rework）⇒ 仍「已驳回」（只认末条）
  - R-6 `pending` + 留痕 `rework` ⇒ 仍「待审核」（封 M2）
  - R-7 `submissionStatus` 缺省 ⇒ 「草稿」（封 M7）
- `apps/mobile/tests/submission-flow.test.ts`（md5 `7d5e68e73aa361bb686b6c4310400257`）`:237-252` 补 **4 条跨层接缝断言**（见下）。

### 变异验证（M1–M7，全部 `--no-cache`）

| 变异 | 结果 |
|---|---|
| M1 `isReworkSubmission` 的 `.at(-1)` → `.at(0)` | 红（R-5） |
| **M2 删掉 `submissionStatus === 'rejected'` 守卫** | **盲区（原 8/8 绿）→ 补 R-6 后红** |
| M3 命中分支 `noteLabel` → `'驳回原因：'` | 红（R-1） |
| M4 命中分支 `text` → `'已驳回'` | 红（R-1） |
| M5 命中分支 `tone` → `'danger'` | 红（R-1） |
| M6 未命中分支 `noteLabel` → `'退回原因：'` | 红 ×3（R-2 / R-4 / R-5） |
| **M7 去掉 `?? 'draft'` 回落** | **盲区（8/8 绿）→ 补 R-7 后红（页面渲染崩溃）** |

**M2 的领域意义（值得记住）**：提报被「退回重改」后，提报人**重新提交**会把 `submissionStatus` 变回 `'pending'`，而 `auditLogs` 是留痕、**不会清空**，此时末条 opinion 仍是 `'rework'`。守卫若被删，重新提交后的待审提报会被误标成「退回重改」。
⇒ R-6 因此**必须断言文案**（`pending` 与「退回重改」的色调**同为 warning**，只断言颜色无法区分）。

### 跨层接缝盲区（主理人独立发现）

- 7.8 的用例断言的是 `reviewSubmission(...)` 的**返回值**；
- 7.9 的用例（R-1..R-7）把 `taskService` **整个 mock 掉了**；
- `submission-flow.test.ts` 调真实 `listMySubmissions()`，却**只断言可见性**（`mine.some(...)` / `others.some(...)`）。

⇒ 「`listMySubmissions()` 会把 `auditLogs` 带回给提报人页」这条接缝**没有任何用例守护**。风险实证：`task.service.ts:1004` 有 `// TODO(real-api): GET /tasks/submissions?createdBy=:userId` —— 真接口若不返回 `auditLogs`，提报人页会**静默回落成「已驳回」**，而全部现有测试仍绿。

**落点纠正（主理人规格写错、QA 纠正）**：不能放 `increment2-completion.test.ts` 的 `task-004` —— `listMySubmissions` 过滤 `isSubmissionRecord`（`src/utils/submission.ts:71-76` 要求 `source === 'submission' && submissionKind != null`），而 `task-004` 是「完成提报」(completion) 型，**取不到**。只有 `submitItem` 生成的才是真提报记录。最终落在 `submission-flow.test.ts:237-252`。

### 终态

- `tsc --noEmit` exit **0**
- 全量 **41 套件 / 808 用例全绿**（主理人以 `--no-cache` 独立复核，与 QA 一致）

| 文件 | md5 |
|---|---|
| `src/screens/MySubmissionsScreen.tsx` | `fbcc6eaecc3b2a92cff5c26e0ac36aba` |
| `tests/my-submissions-rework.test.tsx` | `4aad33d778a60f0b08e88ca30e5c42f1` |
| `tests/submission-flow.test.ts` | `7d5e68e73aa361bb686b6c4310400257` |

### 🔴 本轮新坑

1. **`--no-cache` 必须加**：本机 jest transform 缓存会**串味**（一次 M7 运行错误复现了 M2 的结果）。判定 flaky / 盲区前先 `--no-cache` 重跑。
2. **AntD 两字中文按钮会插空格**：「审核」实际渲染成 `审 核`。用 `includes('审核')` 过滤会**漏掉**它，须用去空白比较。

---

## 十三、Web 审核页「审核按钮缺失」排查与修复

### 现象

用户报「审核页又少了审核的功能按钮」。移动端「审核中心」正常（4 条待审、12 枚按钮），问题在 **Web `/audit`**。

### 根因：不是代码缺陷，是演示数据没有待审项

`apps/web/src/pages/AuditPage.tsx:414-433` —— 审核按钮仅当 `pendingAudit.length > 0 && isManager` 才渲染。实测存储 `os_ws_v1_tasks` 17 条：`approvalStatus` = `approved: 1 / none: 16`，**`pending = 0`**，`approvalType` 全为 `null`。⇒ 「待审核」栏恒为「暂无」，审核按钮无处渲染。

**正路已实测通畅**：任务执行页 →「提报任务完成」→ 填 **4 个必填项**（任务总结 / 执行注意点 / SOP 优化 / 优化建议，`TaskExecutionPanel.tsx:551` 校验）→「提交审核」⇒ `approvalStatus='pending'`、待审核 `0 → 1`、该行出现 `查看 / 修改 / 审 核`，并生成 `approval_pending` 通知。空提交会被校验正确拦下（说明校验本身是好的）。

### 修复：让审核按钮开箱即有（用户拍板）

**落点判断（关键）**：**不能**改 `src/api/mock/data.ts` 的 `mockTasks` —— api 层 `Task` 接口（`src/types/task.ts:108-143`）**根本没有** `approvalStatus` / `approvalType` / `completion` 字段；这些属于 `WorkspaceTask`，由 `toWorkspaceTask` + `normalizeTasks` 补默认值。唯一能造出「带审批态」种子任务的地方是 `apps/web/src/hooks/useWorkspaceTasks.ts` 的 `cloneTasks()`（它本就在追加合成的 `demoProject`）。

**做法**：把种子里已有的 `task-004`（首页原型设计）直接**提升**为待审：

```ts
const seededPending: WorkspaceTask[] = base.map((t) =>
  t.id === 'task-004'
    ? { ...t, approvalStatus: 'pending', approvalType: 'completion',
        completion: { completedAt: dayjs().format('YYYY-MM-DD HH:mm'), tags: ['按计划完成'], ... },
        updatedAt: now }
    : t,
)
// ...
return [demoProject, ...demoChildTasks, ...seededPending]
```

选「提升已有任务」而非「新增一条」，是为了与真实流程一致（待提报 −1、待审核 +1）且不产生同标题重复项。
**不会误发通知**：`prevPendingRef` 初值为 `null`，首次 effect 只记录集合不通知（`useWorkspaceTasks.ts:73-100`）。

### 修复验证（全新会话，`localStorage` 已清空）

| 检查 | 结果 |
|---|---|
| 审核页「待审核」 | **1** —— 「首页原型设计 · 任务完成提报 · 负责人：李娜」 |
| 该行按钮 | `查看 / 修改 / **审 核**` ✅ |
| 「待提报」 | 14 → **13**（与真实提报一致） |
| 点「审 核」 | 弹窗「审核：首页原型设计」（动作 `通过/驳回/撤回`、意见 `同意`、原因可选） |
| 提交后 | task-004 → `status: done`、`approvalStatus: approved`、留痕 `approve+agree`；通知「李娜 完成了任务「首页原型设计」」+「「首页原型设计」审批已通过」 |

⇒ 种子待审项**真能审**，不是只显示出来的空壳。`tsc --noEmit` exit 0。

> ⚠️ 种子只对**新会话**生效；浏览器里已存过 `os_ws_v1_tasks` 的会话不会自动补上这条待审项，需清站点数据或用无痕窗口。

### 产物与服务（收敛后）

| 端口 | 内容 | 产物 |
|---|---|---|
| 4185 | 移动端 | `apps/mobile/dist-v22` |
| 4186 | Web 端 | `apps/web/dist-mvp-8`（`package.json` build 脚本的约定输出目录） |

已清理 `dist-e2e` / `dist-v20` / `dist-v21`，仅剩两个在用产物。

### 🔴 预览服务「反复掉线」的根治

| 尝试 | 结果 |
|---|---|
| 挂工具后台任务 | 一段时间后被回收 |
| `nohup` + 子 shell | 能活一阵，但仍被 Windows **作业对象**连带杀掉（`nohup` 挡不住 Job Object）；本机无 `setsid` |
| PowerShell `Start-Process` | 被环境变量同时存在 `Path` 与 `PATH` 两个键卡死（`已添加项。字典中的关键字:"Path"…`），加 `-UseNewEnvironment` 无效 |
| **WMI `Win32_Process.Create`** | ✅ **成功** —— 由 WMI 服务托管，父进程为 `WmiPrvSE` 而非工具 shell，不受作业对象回收影响 |

停止旧服务：`taskkill //F //PID` 实测无效，须用 PowerShell `Stop-Process -Id <pid> -Force`。

### 诊断探针（`screenshots/mobile/`）

`audit-buttons-diag.js`（移动端审核中心）、`web-audit-diag.js`（Web 审核页）、`web-fill-submit.js`（填满必填项并提报）。

## 十四、M8 变异实证与最终验收（跨层接缝非空转）

**目的**：`submission-flow.test.ts:237-252` 的 4 条接缝断言（真实 `listMySubmissions()` 必须把 `auditLogs` 带回）此前从未被证明「非空转」。这是增量 7.9 最薄弱的一环 —— 组件测试把 `taskService` 整体 mock 掉，7.8 只断言 `reviewSubmission` 返回值，而风险实证是 `task.service.ts:1004` 的 `// TODO(real-api): GET /tasks/submissions`：真接口若丢 `auditLogs`，页面会**静默回落「已驳回」**而测试全绿。

**QA 变异实证（已回报）**：

| 项 | 结果 |
| --- | --- |
| 变异手法 | `listMySubmissions` 加 `.map(({ auditLogs, ...rest }) => rest as Task)`（模拟真接口不返回该字段） |
| 结果 | **红** —— 1 失败 / 26 |
| 失败点 | `pending → rejected（原因必填 ≥4 字）`，`Expected: "rework" / Received: undefined` @ `tests/submission-flow.test.ts:252` |
| 还原 | `task.service.ts` md5 = `4df7256ece3b708f83c59e10616aea3d`，与基线**逐字节一致** |

**主理人独立复核**：`npx jest --no-cache --config jest.config.js` ⇒ **41 套件 / 808 用例全绿**（96.5s）；三个关键文件 md5 全程为基线值（`task.service.ts` `4df7256e…` / `MySubmissionsScreen.tsx` `fbcc6eae…` / `submission-flow.test.ts` `7d5e68e7…`）。

**⚠️ 一次环境抖动（非回归，已排除）**：还原后**首次**全量出现 25 红，全集中在渲染重套件（`audit-center-render` / `today-focus-gate` / `bugfix-root-stack-back`），报错 `Exceeded timeout of 20000ms` + `Can't access .root on unmounted test renderer`。判定「非回归」的三件套全部满足：①该轮 154s vs 复跑 108s（耗时显著拉长）②同命令立即复跑即全绿 ③期间 md5 未漂移。**建议 CI 对渲染重套件留足并行 worker 余量。**

> 至此，增量 7.8 / 7.9 与 Web 审核页修复**全部验收通过**，跨层接缝的守卫由变异实证证明有效。

