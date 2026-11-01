# OpenSchedule 人员 RBAC 与授权契约

- **状态**：Binding contract v1.0
- **日期**：2026-09-25
- **关联 PRD**：`output/openschedule-prd.md`
- **覆盖需求**：R1（角色与权限）、R2（用户表/认证/授权）、R5（路由/菜单/操作入口）、R6（安全验收）

本文档是服务端授权、前端能力判断和安全测试共同使用的唯一角色语义。OpenAPI 文件 `docs/api/personnel-auth.openapi.yaml` 是 HTTP 形状的机器可读来源；本文档是角色、资源范围和拒绝规则的来源。

## 1. 固定角色

角色是持久化枚举和认证上下文中的稳定标识，不能使用 UI 文案代替：

| 标识 | 展示名 | 定位 |
|---|---|---|
| `super_admin` | 超级管理员 | 组织级人员治理者 |
| `admin` | 管理员 | 日常普通人员管理者 |
| `member` | 普通人员 | 业务使用者，无人员管理权限 |

服务端对未知、缺失或大小写不匹配的角色默认拒绝。角色不可由客户端自行声明；创建和更新请求中的 `role` 必须经过当前操作者的授权策略校验。

## 2. 资源与动作

- **资源**：`user`，代表一个可认证的组织账号。
- **集合动作**：`list`, `create`。
- **对象动作**：`read`, `update`, `set_status`, `delete`。
- **自我会话动作**：`login`, `read_session`, `logout`。
- **角色管理动作**：`assign_role`，只允许 `super_admin`，并在更新用户角色时单独审计和校验。

`set_status` 的状态集合为 `active`、`disabled`。删除是终态管理动作；实现可以采用软删除，但删除后的用户不能登录、不能出现在默认列表，也不能被普通管理流程重新激活。

## 3. 权限矩阵

符号含义：`✓` 允许；`—` 拒绝。矩阵同时约束 API、路由守卫、菜单和操作按钮；前端隐藏入口不能替代 API 拒绝。

| 动作 | `super_admin` | `admin` | `member` |
|---|---:|---:|---:|
| `login` / `read_session` / `logout` | ✓ | ✓ | ✓ |
| `user.list`（普通人员范围） | ✓ | ✓ | — |
| `user.read`（普通人员范围） | ✓ | ✓ | — |
| `user.create`（创建 `member`） | ✓ | ✓ | — |
| `user.update`（目标为 `member`） | ✓ | ✓ | — |
| `user.set_status`（目标为 `member`） | ✓ | ✓ | — |
| `user.delete`（目标为 `member`） | ✓ | ✓ | — |
| `user.list/read`（管理员范围） | ✓ | — | — |
| `user.create`（创建 `admin`） | ✓ | — | — |
| `user.update`（目标为 `admin`） | ✓ | — | — |
| `user.set_status`（目标为 `admin`） | ✓ | — | — |
| `user.delete`（目标为 `admin`） | ✓ | — | — |
| `user.assign_role` | ✓ | — | — |
| 任何人员管理动作（目标为 `super_admin`） | ✓（受自保规则约束） | — | — |

### 3.1 目标范围规则

1. `admin` 的列表只能返回 `member`；带 `role=admin`、`role=super_admin` 或越界目标 ID 的请求必须由服务端拒绝，不能仅过滤后假装成功。
2. `admin` 创建用户时服务端强制角色为 `member`；客户端提交 `admin` 或 `super_admin` 必须返回 `403 FORBIDDEN` 或 `422 INVALID_ROLE_ASSIGNMENT`，具体错误码按校验层决定但不得成功。
3. `admin` 不能编辑、禁用或删除其他管理员。`super_admin` 负责管理员和普通人员，这是当前默认安全边界。
4. `super_admin` 可以管理 `admin` 和 `member`；目标为 `super_admin` 的自我禁用、删除或降权必须拒绝，避免系统失去最后治理者。是否允许管理另一名 `super_admin` 不在本期范围，默认拒绝。
5. `member` 只能访问自己的认证会话；本期不提供普通人员查看他人资料的能力。
6. 任何请求体中的 `role`、`status`、`id` 不能扩大操作者的目标范围。服务端以路径目标、数据库当前角色和当前会话为准。

## 4. 认证上下文（R7-6 双鉴权收敛后）

> **变更日志**：R7-6 (2026-10-10) 起所有人员域端点统一经全局 JwtAuthGuard（Bearer access token + refresh token），
> 历史 HttpOnly 会话 cookie `openschedule_session` + `X-CSRF-Token` 写操作护栏已删除（OWASP 视 Bearer 为 CSRF 免疫）。
> 主鉴权切片见 `docs/contracts/personnel-permission-matrix.md` §4.0；前后端实装消除了
> `docs/ddd/production-ddd-design.md` §1.1 列出的「同一 client.ts 内两套鉴权、安全面翻倍」缺陷。

认证由全局 `JwtAuthGuard` 在受保护请求上解析 `Authorization: Bearer <jwt>`，
实时加载用户与角色（user_roles × roles 展开），并向后续层注入最小上下文：

```text
AuthenticatedPrincipal {
  userId: string
  tenantId: string
  role: super_admin | admin | member
  roles: Array<{ key, scope, scopeResourceId, permissions? }>
}
```

- 无 Bearer、无效/过期 access、refresh 全部失败统一得到 `401 UNAUTHENTICATED`（40101 = access 过期）。
- 认证上下文不可从请求体、查询参数或客户端 header 中的角色字段读取。
- 客户端仅在受保护请求经 `RequireAuth` 路由层拉取 `/auth/me` 恢复 `authStore.user`；前端不得把 access/refresh 写
  入文件外位置。
- 写操作不再要求 `X-CSRF-Token`；Bearer token 由 JS 主动注入，浏览器不会自动附带，天然 CSRF 免疫。

## 5. 分层与模块边界

依赖方向固定为 `route/controller → application service → authorization policy + repository`：

1. **全局 JwtAuthGuard**（APP_GUARD）：解析 Bearer、确认用户处于 `active`、创建 `AuthUser`；
   租户上下文通过 `TenantContextService.attach(user.tenantId, user.userId)` 注入到下游。
2. **授权策略**：接收 principal、动作和目标快照，执行本文件的默认拒绝矩阵；不读取 HTTP 细节。
3. **应用服务**：先加载目标用户，再调用授权策略，随后执行输入校验和 repository 写入；任何写入都不能绕过策略。
4. **repository/data layer**：只负责持久化与查询，不内置"当前用户是管理员所以允许"的业务判断。
5. **route/controller**：完成 DTO 解码、状态码映射和响应包装，不实现角色分支或数据库查询。
6. **前端**：API client 负责请求/响应映射；route guard、菜单和按钮只表达体验层能力，不作为安全边界。

禁止把授权规则散落在 controller、React 组件或通用 `utils` 中，也禁止用 mock 或本地状态回退真实 API。

## 6. 错误语义

所有错误使用 OpenAPI 中的统一 `ErrorResponse`：

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You are not allowed to perform this action.",
    "requestId": "req_01J...",
    "details": []
  }
}
```

- `401 UNAUTHENTICATED`：没有有效认证上下文。
- `403 FORBIDDEN`：身份有效但角色/目标范围不允许。
- `404 USER_NOT_FOUND`：资源不存在或对当前 principal 不可见；不得泄露越权目标存在性。
- `409 USER_CONFLICT`：登录标识已存在或状态转换冲突。
- `422 VALIDATION_ERROR`：字段格式、枚举或业务约束无效。
- `429 AUTH_RATE_LIMITED`：登录尝试触发速率限制（如认证实现启用）。

> **R7-6 起作废**：`403 CSRF_INVALID` —— Bearer token 形态下不再需要 CSRF 校验。
- `409 ROLE_GUARD`：最后一名活跃 super_admin 的禁用 / 删除 / 降权保护（与 PersonnelAuthzGuard 中
  `countActiveSuperAdmins===0` 分支对齐；与 USER_CONFLICT 复用 409 信封）。

错误 message 不得返回密码、凭证摘要、会话值或数据库内部字段；`requestId` 用于关联日志和测试诊断。

## 7. 路由、菜单和按钮映射

| UI 入口 | 显示条件 | API 安全依据 |
|---|---|---|
| 人员管理路由 `/people` | `super_admin` 或 `admin` 且会话 active | 对应 `user.list` |
| 新建人员 | `super_admin` 或 `admin`；创建角色固定为 `member`（`super_admin` 可选 `admin`） | `POST /users` |
| 编辑普通人员 | `super_admin` 或 `admin` 且目标为 `member` | `PATCH /users/{userId}` |
| 禁用/启用普通人员 | `super_admin` 或 `admin` 且目标为 `member` | `POST /users/{userId}/status` |
| 删除普通人员 | `super_admin` 或 `admin` 且目标为 `member` | `DELETE /users/{userId}` |
| 管理管理员 | 仅 `super_admin` | 同上对象 API + 服务端目标策略 |

页面直接 URL、手工构造请求或篡改前端状态都必须经过同一服务端认证和授权链。

## 8. 不可变安全不变量与测试锚点

- `admin_cannot_manage_admin`：管理员对管理员的读写均被拒绝。
- `member_cannot_manage_users`：普通人员不能列出、读取或变更任何他人。
- `super_admin_can_manage_admin_and_member`：超级管理员可按矩阵管理目标。
- `role_field_cannot_escalate`：低权限操作者提交更高角色不能升级权限。
- `target_id_cannot_cross_scope`：替换目标 ID 不能越过角色范围。
- `disabled_user_cannot_authenticate`：禁用用户不能建立新会话/签发 access token。
- `invalid_or_revoked_jti_is_rejected`：过期、注销（jti 黑名单）和伪造 refresh token 统一拒绝。
- `sensitive_fields_never_returned`：密码、凭证摘要、Bearer/refresh/CSRF 任何形态的 secret 不出现在 API 响应。

## 9. 边界决策记录

**当前采用的安全默认值**：`admin` 不能编辑、禁用或删除其他 `admin`；只有 `super_admin` 管理管理员和普通人员。该默认值对应 PRD 的横向越权防护建议。若产品最终确认不同规则，必须同步修改本文件、OpenAPI 的 security 描述、前端能力映射和安全测试，不能只调整按钮。
