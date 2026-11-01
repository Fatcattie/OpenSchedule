# 人员管理权限矩阵与 API 契约（三角色固化基线）

- **文档状态**：Contract 1.1 —— R7-6 双鉴权收敛（2026-10-10）
- **变更日志**：
  - 1.1 (2026-10-10, R7-6)：所有人员域端点改走全局 JWT Bearer（access 15m + refresh 7d），删除
    `sessionCookie` (`openschedule_session`) + `X-CSRF-Token` 写操作护栏。Bearer token 不会被浏览器自动附加，
    OWASP 视为对 CSRF 免疫（Cheat Sheet § Session Management）。矩阵三角色/不变量/边界决策与权限点枚举保持不变；
    第 4 节表面字段（`User`/`Principal`/`AuthSessionResponse`/`X-CSRF-Token`/`/auth/login`/`/auth/session`/`/auth/logout`）作废，
    取而代之的是 Bearer `Authorization: Bearer <jwt>` + `/auth/me` + `/auth/refresh`。
  - 1.0 (2026-09-27)：初版固化三角色 + 矩阵 + cookie 会话切片
- **日期**：2026-09-27（v1.0）/ 2026-10-10（v1.1）
- **需求来源**：`output/openschedule-prd.md` FR-001～FR-009；原始需求 R1（固化三角色及权限矩阵）、R4（删除 mock/localStorage/身份切换）
- **机器可读矩阵**：`services/api/src/openapi/permissions-matrix.yaml`（`x-permission-matrix` 节，v1.1）
- **策略实现**：`services/api/src/middleware/authz.ts`（`canPersonnel` / `manageableRoles` / `PersonnelAuthzGuard`）
- **API 契约切片**：`services/api/src/openapi/auth.yaml`（auth，Bearer 鉴权端点全集）、
  `users.yaml`（users）、`roles.yaml`（roles + capabilities）

## 1. 锁定的边界决策（需求方已建议，本契约按此固化）

> **admin 只能管理普通人员（member）；super_admin 负责管理员与普通人员。默认拒绝。**

- `admin` 对 `admin` 目标的一切人员管理动作（读/建/改/禁用启用/删除/指派角色）全部 **deny** —— 防横向越权。
- `admin` 对 `member`：list / read / create / update / set_status / delete 允许；**assign_role 禁止**（角色指派为 super_admin 独占，防止 admin 造出新的 admin）。
- `super_admin`：对 `admin` 与 `member` 全部 7 个动作允许。
- `member`：无任何人员管理动作，全部 deny。
- 任何没有显式 allow 规则的 `(action, actor, target)` 组合一律 **deny**（default-deny）。
- 变更本边界 = 契约变更，必须同步修改：本文件 + `permissions-matrix.yaml` + `authz.ts` + 安全测试 + 前端能力映射。

## 2. 固定角色（FR-001）

| 角色标识 | 显示名 | 租户角色键（role-seed） | 语义 |
|---|---|---|---|
| `super_admin` | 超级管理员 | `tenant.owner` | 组织级人员与管理员治理 |
| `admin` | 管理员 | `tenant.admin` | 日常人员管理，仅 member |
| `member` | 普通成员 | `tenant.member` | 业务使用者，无人员管理权 |

角色为闭集枚举，API 与数据层不接受未知角色值；角色解析以持久化的 `user_roles × roles` 实时派生（不读 token 声明），权限变更即刻生效。

## 3. 权限矩阵（FR-002，机器可读版见 permissions-matrix.yaml）

动作目录：`user.list` / `user.read` / `user.create` / `user.update` / `user.set_status` / `user.delete` / `user.assign_role`

| 动作 ＼ 操作者→目标 | super_admin → admin | super_admin → member | admin → member | admin → admin | member → * |
|---|:---:|:---:|:---:|:---:|:---:|
| user.list | allow | allow | allow | **deny** | deny |
| user.read | allow | allow | allow | **deny** | deny |
| user.create | allow | allow | allow | **deny** | deny |
| user.update | allow | allow | allow | **deny** | deny |
| user.set_status | allow | allow | allow | **deny** | deny |
| user.delete | allow | allow | allow | **deny** | deny |
| user.assign_role | allow | allow | **deny** | **deny** | deny |

不变量（与 yaml `invariants` 一致，逐条有测试断言）：

1. **default_deny** —— 无显式 allow 即拒绝。
2. **last_super_admin_guard** —— 最后一名活跃 `super_admin` 不可被禁用/删除/降权（409）；super_admin 自身账号亦不可对自己的该目标动作操作（409）。
3. **no_self_escalation_via_payload** —— 请求体中的 `role`/`status`/`id` 不扩大操作者范围；授权基于持久化的目标快照复核。
4. **unknown_role_rejected** —— 未知/缺失角色在 schema 与数据库层双重拒绝。
5. **hidden_ui_is_not_authorization** —— 路由/菜单/按钮隐藏仅是 UX 投影，API 每次请求重评矩阵。

## 4. 绑定 API 表面（前后端共同实现）

所有人员端点经全局 `JwtAuthGuard` 鉴权（Bearer `Authorization: Bearer <jwt>`），
IDOR/跨租户防护由 `PersonnelAuthzGuard` 对象级授权兜底。前端身份只来自
`GET /auth/me` Bearer（FR-004/FR-006；RequireAuth 在路由层拉取并写入
`authStore.user`）；能力只来自 `GET /me/capabilities`（FR-007）—— 均非安全边界，
安全边界是服务端矩阵。

### 4.0 鉴权切片（auth.yaml · Bearer · 2026-10-10 起）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/register` | 注册（创建账号 + 租户 + 租户角色克隆 + 颁发 token + 自动化播种） |
| POST | `/auth/login` | 登录，颁发 access + refresh；5/分钟/IP 防爆破；返回 `mustChangePassword` 标记 |
| POST | `/auth/refresh` | 轮换 refresh（吊销旧 jti，发新双 token） |
| POST | `/auth/logout` | 吊销 refresh jti（幂等） |
| GET  | `/auth/me` | 当前用户 + 租户 + roles（RequireAuth 启动时拉取，刷新后恢复） |
| POST | `/auth/members` | 管理员代建成员（super_admin 不开放；admin 创建 admin/member/viewer；密码临时 + `mustChangePassword=true`） |
| POST | `/auth/change-password` | 校验当前（临时）密码 → 写新密 → 清除强制改密标记 |

`AuthEnvelope = { accessToken, refreshToken, expiresIn, user, tenantId, tenant, mustChangePassword }`；
`User` 最小投影（`id/email/displayName/avatarUrl/locale/timezone/status/createdAt/updatedAt/roles`），
**永不** 序列化 `passwordHash`、`csrfToken` 等任何凭证摘要。

### 4.1 用户切片（users.yaml）

| 方法 | 路径 | 说明 | 关键响应 |
|---|---|---|---|
| GET | `/users` | 列表（按操作者可管范围服务端裁剪）：`?role&status&search&limit(1..100,默认25)&cursor`；越界 role 过滤 → 403 | 200 `{items, nextCursor}` / 401 / 403 / 422 |
| POST | `/users` | 创建；`admin` 只能建 `member`，`super_admin` 可选 `admin`/`member`；密码 `writeOnly`（≥12 位），邮箱唯一冲突 409 | 201 `{user}` / 401 / 403 / 409 / 422 |
| GET | `/users/{userId}` | 对象级读；目标不在范围 → 403（不泄露目标角色/存在性），不存在 → 404 | 200 / 401 / 403 / 404 |
| PATCH | `/users/{userId}` | 更新 `email/displayName`；角色指派仅 super_admin，按目标当前快照复核（防请求体提权）；最后 super_admin 保护 | 200 / 401 / 403 / 404 / 409 / 422 |
| POST | `/users/{userId}/status` | 启用/禁用；最后活跃 super_admin 不可禁用（409）；禁用用户不能再登录 | 200 / 401 / 403 / 404 / 409 / 422 |
| DELETE | `/users/{userId}` | 删除（事务软删除：解绑角色 + 置 disabled）；最后 super_admin 不可删除（409） | 204 / 401 / 403 / 404 / 409 |

### 4.2 角色与能力切片（roles.yaml）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/roles` | 返回固定的三个角色（闭集），前端据此渲染角色标签 |
| GET | `/me/capabilities` | 当前主体的能力集：`{ list, create, update, setStatus, delete, assignRole, manageableRoles }`。admin→`[member]`；super_admin→`[admin,member]`；member→`[]` |

**前端契约**：路由守卫、菜单项、操作按钮的显隐由服务端矩阵派生；`/auth/me` 写入 `authStore.user`，
`useCurrentRole` 仅以 `isManagerRole('manager' | 'member')` 形式表达；`PersonnelPage` 按
`/me/capabilities` 决定目标行上可用的操作（FR-007）。

### 4.3 矩阵查询（permissions-matrix.yaml · 1.1）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/permissions/matrix` | 返回机器可读矩阵本体；前端可缓存用于渲染，但**不得**把它当安全边界；回归套件用它比对线上行为（FR-009） |

### 4.4 统一错误信封（跨切片一致）

```json
{ "error": { "code": "FORBIDDEN", "message": "...", "requestId": "...", "details": [ {"field": "...", "issue": "..."} ] } }
```

码集合：`UNAUTHENTICATED(401)` / `FORBIDDEN(403)` / `USER_NOT_FOUND(404)` /
`USER_CONFLICT(409)` / `VALIDATION_ERROR(422)` / `INVALID_ROLE_ASSIGNMENT` /
`AUTH_RATE_LIMITED(429)`。错误信息不泄露目标账号存在性（越权 403 与不存在 404 的措辞区分是契约行为，测试须断言）。

> **R7-6 作废**：`CSRF_INVALID` 与 cookie session 相关语义随历史 `/auth/{login,session,logout}`
> 端点一并删除。前端不再携带 `X-CSRF-Token` 头。

## 5. 前端能力投影规则（FR-007，路由/菜单/按钮）

| 投影点 | 规则 | 依赖 |
|---|---|---|
| 路由 `/users` 可进入 | `capabilities.personnel.list === true` 且会话有效；否则重定向/拒绝 | `/auth/session` + `/me/capabilities` |
| 侧栏/顶栏「人员管理」菜单 | 仅当 `list === true` 显示 | 同上 |
| 「创建人员」按钮 | `create === true`；可建角色下拉 = `manageableRoles` | 同上 |
| 目标行「编辑」 | `update === true` 且目标角色 ∈ `manageableRoles`（或 `assignRole === true`） | 同上 |
| 目标行「禁用/启用」 | `setStatus === true` 且目标角色 ∈ `manageableRoles` | 同上 |
| 目标行「删除」 | `delete === true` 且目标角色 ∈ `manageableRoles` | 同上 |
| 「调整角色」控件 | `assignRole === true`（super_admin 独占） | 同上 |
| 禁用/删除超管目标 | 允许发起但服务端 409 拒绝（最后活跃 super_admin） | users.yaml 409 |

## 6. 需求追踪（PRD FR → 契约锚点）

| PRD 需求 | 契约锚点 | 说明 |
|---|---|---|
| FR-001 三角色枚举与矩阵 | `x-permission-matrix.roles/actions/rules` + `authz.ts GRANTS` | 枚举闭集，矩阵逐格允许/拒绝 |
| FR-002 服务端强制矩阵 | `PersonnelAuthzGuard`（对象级 403）+ 会话守卫（401） | 每请求重评，非前端状态 |
| FR-003 用户表与生命周期 | `users.yaml` 用户投影 + 409 保护 | 无凭证泄漏，软删除 |
| FR-004 真实认证 | `auth.yaml` 登录/会话/退出 | 会话唯一身份来源 |
| FR-005 真实人员 API | `users.yaml` 全部 CRUD | 无 mock 兜底 |
| FR-006 无身份切换 | `permissions-matrix.yaml` + 前端只用 session/capabilities | 隐藏 UI ≠ 授权 |
| FR-007 路由/菜单/按钮一致 | `roles.yaml /me/capabilities` | 能力驱动渲染 |
| FR-008 越权/安全测试锚点 | `admin_cannot_manage_admin`、`member_cannot_manage_users`、`last_super_admin_guard` | 矩阵逐格断言 |
| FR-009 回归 | 回归套件每 release 回放 `x-permission-matrix` | 防回退 |

## 7. 变更流程

矩阵任何一格变化（例如放开 admin→admin）视为 **breaking contract change**：必须同步更新本文件、`permissions-matrix.yaml`、`authz.ts` GRANTS、对应安全测试与前端能力映射，缺一不可；单独改 UI 文案不产生授权效果。
