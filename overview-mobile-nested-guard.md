# 交付概览：`<button>` 嵌套回归守护覆盖补齐

> 团队 `software-mobile-nested-guard` · 项目 `apps/mobile`（Expo SDK 57 / RN 0.86）
> 日期：2026-10-05 · 承接 `overview-mobile-nested-button-fix.md` 的两条遗留

## TL;DR

补上嵌套根治后留下的**两处回归守护缺口** —— ①`AuditCenterScreen` 的「审核」**回退分支**零覆盖；②全仓 4 个 `TaskCard` 消费屏只有 2 个有守护。新增 **NB-5 / NB-6 / NB-7** 三例（文件 4 → 7 例），并用**变异测试**证明三例「有牙齿」（非平凡通过）。**仅动 `tests/`，未改任何 `src/` 代码。**

## 缺口分析（读源码锁定，非猜测）

### 缺口 ①：`<Button label="审核">` 回退分支

| 环节 | 说明 |
|---|---|
| `actionsFor`（`AuditCenterScreen.tsx:196-204`） | `canReview ? ['approve','reject'] : []` + `isWithdrawable ? ['withdraw'] : []` |
| `showInlineAudit`（`:371`） | `actions.includes('approve') && actions.includes('reject')` |
| ⇒ 回退分支条件 | `canReview===false`（member）**且**任务对该用户可撤销 ⇒ `actions=['withdraw']`、`showInlineAudit=false` |
| `isWithdrawable`（`utils/submission.ts:110-118`） | `submissionStatus==='pending'` 且 `submitter===actorId`；`submitter = resolveApproveBranch==='completion' ? (assigneeId ?? createdBy) : createdBy` |
| 测试里 `useAuth` mock 的 user id | **`user-001`** ⇒ 场景 = member + `createdBy:'user-001'` 的 pending 提报 |

### 缺口 ②：`TaskCard.right`/`footer` 仍是陷阱

`TaskCard` 的 `right`/`footer` 插槽渲染在 `Card` 的 `<Pressable accessibilityRole="button">` **内部**（契约刻意未改）。全仓 4 个消费屏中，`AuditCenterScreen`、`BoardScreen` 已有守护，`TodayFocusScreen`、`WorkspaceScreen` 尚无。

## 改动清单（仅 1 文件，零新增依赖）

| 文件 | 改动 |
|---|---|
| `tests/no-nested-buttons.test.tsx` | 4 → **7 例**：新增 NB-5（回退分支）/ NB-6（`TodayFocusScreen` 全树）/ NB-7（`WorkspaceScreen` 全树）；`mockMode` 扩展 `today`/`workspace`；`useAsync` mock 增 `today`/`workspace` 派发；补 `focusService`/`taskService` 方法；`mount()` 支持新屏 |

**`src/` 零改动** ⇒ 无行为变更风险。

### 关键设计决定：NB-6/NB-7 必须是「非平凡通过」

两屏当前**没有**交互元素落在 `right`/`footer`，若只写「全树无嵌套」，用例**必然绿**（零卡片 + 全树无嵌套也是绿）。因此：
- 用例内**注入真实数据**（`mockFocus.dueToday` / `mockTodos` 各 1 条）确保**确实渲染出卡片**；
- 再用变异测试证明：往对应屏的 `TaskCard.right` 塞按钮 ⇒ 用例**必须变红**。

## 验证结果

### 主理人独立复跑

`npx jest --config jest.config.js --no-cache tests/no-nested-buttons.test.tsx` → **7/7 通过**（53.6s，5 个 describe）。

### QA 独立变异验证（严过关）—— ✅ IS_PASS: YES · 路由 NoOne

| 编号 | 变异 | 实际变红用例 | 判定 |
|---|---|---|---|
| M1 | `AuditCenterScreen` 回退 `<Button label="审核">` 移入 `TaskCard.right` | NB-5（`:389`） | ✅ 定向捕获 |
| M2a | `WorkspaceScreen` 的 `<TaskCard right={按钮}>` | NB-7（`:469`） | ✅ 定向捕获 |
| M2b | `TodayFocusScreen` 的 `TaskCard.right` 塞交互元素 | NB-6（`:454`） | ✅ 定向捕获 |
| M3 | `showInlineAudit` 的 approve 注入 `right` | NB-1（`:328`）、NB-2（`:341`） | ✅ 定向捕获 |
| M4 | `WorkspaceScreen` 在 `todos` 前插 1 个 `useAsync` | NB-7 **仍绿** ⚠ | 暴露 mock 调用序脆弱性 |

- M1/M2a/M2b/M3 全部**定向**变红 ⇒ NB-5/6/7 非平凡通过、有守护力。
- 全量 `--no-cache`：**44 套件 / 835 用例全绿**（165.4s，基线 44/832）；`tsc --noEmit` exit 0。
- 工作区逐字节还原（主理人独立核对，非依赖 QA 自述）：

```
AuditCenterScreen.tsx    797704078c778673d0e6fb30b12280ad  ✅
WorkspaceScreen.tsx      ff63e15caf84b3247d19f36439949390  ✅
TodayFocusScreen.tsx     80426906713d0c3c57ac10b486efba9a  ✅
TaskCard.tsx             afe81c7feb17f4b2ce0b33c756326855  ✅
BoardScreen.tsx          3fefef1f8cf36a330c524ba705bd05cd  ✅
变异残留扫描 → 无命中 ✅ ; 用例数 = 7
```

## 遗留问题（非阻断）

1. **`%3` mock 调用序脆弱性**（QA 的 M4 暴露）—— `useAsync` mock 按全局 `mockAsyncCall % 3` 派发数据，与真实调用点**解耦**。若日后增删 `useAsync` 调用点，NB-6/NB-7 可能**静默绿或假红**（M4 实测 12≡0 mod 3 恰好落回 index 0 ⇒ 仍绿）。
   - **建议**：改为 **loader 驱动**（`useAsync` 真正执行传入的 loader），消除调用序耦合。仅动 `tests/`，可随时加固。
2. **`TaskCard.right`/`footer` 契约仍是陷阱** —— 未改公共契约，未来塞入交互元素仍会复现。可考虑 eslint 规则或组件级开发期告警。

## 产物与访问

- 移动端预览（`dist-v25`，含嵌套根治）→ **http://127.0.0.1:4185**
- Web 预览 → **http://127.0.0.1:4186**
- App dev server → **http://127.0.0.1:8081**
