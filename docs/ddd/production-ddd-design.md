# OpenSchedule 生产化 DDD 设计文档

- **版本**：v1.1 · 2026-09-29（复核版）
- **定位**：从「演示可用」到「生产上线」的完整拆解 —— 领域驱动设计的战略/战术建模 + 生产化差距清单 + 分批施工计划
- **读者**：下一步负责开发的 Agent / 工程师。每个批次（§5）都是一张可直接认领的任务卡
- **上游依据**：`readme.md`（产品定位与工程纪律）、`services/api/prisma/schema.prisma`（DDL 唯一权威）、`docs/contracts/personnel-permission-matrix.md`（权限契约）、`docs/superpowers/plans/2026-08-22-foundation-gap-closure.md`（回补计划）
- **变更纪律**：本文件与 `schema.prisma`、权限矩阵契约同为准出依据；改动边界决策必须同步更新 §6 ADR 清单

> **复核结论（必须先读）**
>
> - 本文件现在可以作为后续 Agent 的**开发蓝图和验收基线**，但它不是已经完成的生产部署包。
> - 当前仓库仍然**不可直接上线**：版本化迁移、生产镜像/反向代理、备份恢复、监控告警、集成/E2E 测试、密钥管理和多项安全能力尚未完成。
> - 只有当 §4.1 的 Go/No-Go 门禁全部完成，并且 §8 的生产交付物在仓库或明确的基础设施仓库中实际存在、经过 staging 验证，才能宣称可生产部署。
> - 文档中的“目标”“必须补”“R1–R12”不是现状声明。未标记为“已具备”的能力，Agent 不得假定已经实现。
> - Prisma 没有可直接依赖的通用 `rollback` 命令；生产迁移回滚采用 expand/contract、向前兼容的应用回滚，以及经验证的备份恢复/PITR，不允许把未经验证的 down SQL 当作回滚方案。

---

# 0. 阅读指南

| 章节 | 内容 | 什么时候读 |
|---|---|---|
| §1 | 现状快照（已核实事实，非推测） | 开工前 |
| §2 | DDD 战略/战术设计（限界上下文、聚合、事件、分层） | 做任何领域改动前 |
| §3 | 生产化差距拆解（8 大主题，现状→目标→任务→验收） | 按主题认领工作时 |
| §4 | 上线门禁与 SLO | 每批 DoD 对齐 |
| §5 | 分批施工计划 R1–R12（任务卡） | 直接领取执行 |
| §6 | 风险登记册与待定决策（ADR） | 遇到歧义先查这里 |
| §7 | 生产交付物清单与证据要求 | 申请上线前 |
| §8 | 附录：领域事件目录 / 权限点 / 术语表 | 查阅 |

**关键约定**（沿用 readme 工程纪律，不变）：
1. `services/api` 是**唯一写库方**；`services/ai` 永不直连业务库，只经 `POST /internal/ai/results` 回调
2. 租户隔离：所有**租户作用域聚合/业务表**必须有 `tenant_id`；系统级 `User`、系统角色模板 `Role(tenant_id IS NULL)` 是显式例外；`NotificationDelivery` 通过父 `Notification` 继承租户。任何新增例外必须在本文件 §6 ADR 登记并有隔离测试
3. API/DTO `camelCase`，DB 字段 `snake_case`（@map 映射）；主键 UUIDv7；时间 `timestamptz` UTC
4. 模块间只经 service 层或事件交互，禁止跨模块直接查表
5. AI 只提议、人确认；`ai_proposals` 草稿态 + 审批门是 AI 写业务的唯一路径

---

# 1. 现状快照（2026-09-28 核实）

## 1.1 后端 services/api（NestJS 11 + Prisma 6 模块化单体）

**26 个领域模块**：auth / rbac / users / audit / projects / tasks / assignments / comments / attachments / search / import-export / summaries / notifications / reminders / proposals / dependencies / evaluations / reports / health / resource-pool / templates / automation / api-keys / webhooks / calendar / integrations

**通用层 common/**（@Global，已具备的生产化底子）：
- 租户：`TenantContextService`（AsyncLocalStorage）+ Prisma 扩展自动注入 `tenant_id` 谓词（当前仅覆盖 **14 个**模型）+ worker `runWithTenant` bypass
- 鉴权：全局 `JwtAuthGuard`（@Public 跳过，实时加载 user_roles×roles，绑定租户上下文）
- 审计：`AuditService.record`（事务内写）+ `@Audited` 装饰器；`AuditLog` append-only
- 幂等：`IdempotencyInterceptor`（写方法 Idempotency-Key 24h 重放）——**进程内 Map，单实例有效**
- 统一错误信封 `{code,message,details,traceId,requestId}`（分段码 400x/401x/403x/404x/409x/429x）
- S3 存储（自实现 SigV4，零 SDK）、Redis 懒连接（宕机降级）、`/health`（仅探 DB）

**数据层**：`schema.prisma` 当前有 **24 个 model**，覆盖 11 个域。租户过滤扩展当前只自动覆盖 14 个模型，`Tenant`、系统级 `User`、可空租户的 `Role`、通过父记录继承租户的 `NotificationDelivery`，以及后期追加的模板/自动化/API Key/Webhook/Calendar 模型均需要显式过滤或补齐结构化隔离。**仓库内无 `prisma/migrations/` 目录**——`main.ts` 启动时用 `prisma db push --skip-generate` 直接建表（自注「骨架阶段，Phase 2 补正式迁移」）。

**事件**：6 个事件常量文件（TASK / PROJECT / COMMENT / NOTIFICATION / REMINDER / ASSIGNMENT_EVENTS），总线 `@nestjs/event-emitter` 进程内发布——**全库 0 个 `@OnEvent` 订阅者**，事件只发不收；events 文件头部均注明「payload 契约唯一来源 packages/domain-events，TODO 迁移」，而 `packages/shared-types` 目录不存在。

**测试**：19 个 spec，全部是纯函数引擎单测（CPM/评分/规则引擎/签名/重试策略/解析器）；**controller/service/Prisma 集成层零测试**；e2e 仅 `test/personnel-authz.e2e-spec.ts` 1 个；根 `tests/authz/` 有 2 个 authz 回归测试（29KB）。无测试的模块 15 个（auth/rbac/users/projects/tasks.service/assignments/reminders/search/import-export/summaries/templates/integrations 等）。

**功能性缺口（占位/TODO，按风险排序）**：
| 缺口 | 位置 | 影响 |
|---|---|---|
| 通知外发三通道全占位 | `notifications/adapters/{email,im,push}.adapter.ts` 均 throw NOT_IMPLEMENTED | 邮件/IM/推送均不可达，只能站内 |
| `notification.failed` 监听未注册、重试 worker 未接线 | `notifications.module.ts` 头部 TODO | 外发失败无重试闭环 |
| refresh token 存储进程内 Map | `auth/refresh-token.store.ts` | 多实例/重启即失效，无法吊销 |
| 幂等拦截器进程内 Map | `common/interceptors/idempotency.interceptor.ts` | 多实例部署幂等失效 |
| 限流只有错误码和 OpenAPI 契约，无实现 | 无 @nestjs/throttler | 登录爆破/接口滥用无防线 |
| 无 helmet/安全响应头 | main.ts | 基础安全头缺失 |
| WS 广播无实现（依赖已装 @nestjs/websockets） | 无 @WebSocketGateway | 看板/通知无法实时刷新 |
| BullMQ 未接线（redis.service 注释提及但代码未用）；reminders.worker 用 `setInterval` 自启 | reminders / notifications | 后台任务无队列语义、无失败隔离 |
| 多租户切换未实现（取最早加入租户） | auth-user.loader.ts | 单租户语义，需产品确认首发形态 |
| 邀请加入端点未建（register.dto / auth.service 标注） | auth | 成员只能自注册，无法闭环 onboarding |
| 自动化触发未接线（tasks.service:616）、阻塞>3 天升级未实现（:642） | tasks / automation | 规则引擎空转 |
| 搜索缺 gin_trgm_ops 索引 | search.service.ts 注释自承 | 数据量上来后搜索慢 |
| schema 尾部 6 模型（ApiKey/Webhook/Calendar*）风格不一致：cuid()、无 @map、无 timestamptz 精度 | schema.prisma | 与全局约定冲突，需统一 |
| 租户过滤覆盖不完整 | `PrismaService.TENANT_SCOPED_MODELS` 当前仅 14 个；模板/自动化/API Key/Webhook/Calendar 等模型未纳入自动保护 | 任何新增查询必须显式 tenant 谓词；R1/R4 补 allowlist 或结构化约束 + 跨租户集成测试 |
| 集成凭据存在明文存储风险 | `CalendarAccount.accessToken/refreshToken`、`Webhook.secret` 在 schema 中为明文字段 | 必须使用 `ENCRYPTION_KEY` 加密后存储，日志/响应/备份均不得泄露明文 |
| 可空列唯一约束语义不可靠 | `Role(tenantId=NULL)` 与租户级 `UserRole(scopeResourceId=NULL)` 的 Prisma `@@unique` 在 PostgreSQL 中允许多个 NULL | 用部分唯一索引/非空哨兵值/显式业务约束修正，并补重复分配集成测试 |
| ~~双鉴权体系并存：JWT Bearer（modules/auth）+ cookie 会话（middleware/authz.ts + PersonnelAuthService）~~ | ~~src/middleware、src/services~~ | **R7-6 (2026-10-10) 已收敛**：人员域统一走全局 `JwtAuthGuard`，`sessionClient` + `X-CSRF-Token` + `PersonnelAuthService` 等历史机制全部删除，详见 `docs/ddd/production-progress.md` §R7-6。 |
| `/health` 不探 Redis | common/health | Redis 挂了探活仍绿 |

## 1.2 前端 apps/web（React 19 + Vite + AntD 5）

- 25 个页面全部存在且 UI 完整，但存在**三套并行数据体系**：
  1. **真实 API 层**（axios + Bearer + 401 自动 refresh，22 个 api 模块）——但 `USE_MOCK` **默认开**（`api/config.ts`，`VITE_USE_MOCK !== 'false'`）
  2. **mock 层**（`api/mock/handlers.ts` 约 1700 行 + data.ts，覆盖几乎全部域，与 localStorage 演示数据互通）——标注「后端就绪后删除」
  3. **localStorage 演示体系**（`os_ws_v1_*` 键：协作工作台/任务/Wiki/SOP/经验/提示词/Skill/心情/MetaSkill，约 10 个 `useLocalStorageState` hook）——**无任何后端对应物**
- 人员域（`/users`）走与主域同样的 `client`（Bearer + 401 自动 refresh）；历史 `sessionClient`（HttpOnly cookie + 内存 CSRF）已在 R7-6 删除
- TanStack Query 已配 QueryClientProvider 但页面基本没接；服务端状态散落各 hook
- 看板无拖拽（Dropdown 菜单移动，dnd-kit 未装）；甘特图拖拽 TODO 未接
- **PWA 已移除**（SW CacheFirst 导致旧 JS 缓存 bug，main.tsx 强制注销 SW 并清 caches）；icon-192/512.png 残留；无 manifest
- 无前端测试运行时（唯一测试是源码字符串断言）；无代码分割（无 lazy）；遗留多个 `dist-mvp-*` 构建目录（当前输出 `dist-mvp-8`，`emptyOutDir:false`）
- 本地模拟占位：改密码（PersonalProfilePage）、IM 转发通道（ForwardMessageModal）、aiGenerator 本地模板、useCurrentRole localStorage 角色切换

## 1.3 AI 服务 services/ai（Python 3.12 + FastAPI + LangGraph）

- 仅 1 条流水线：`POST /ai/decompose`（202+run_id）→ `GET /ai/decompose/{run_id}/stream`（SSE 帧协议 ai.start/chunk/status/done/error，断线重放 ≤200 帧/300s 窗口/30s 心跳）
- LangGraph `plan→validate(retry≤3)→emit→END`；LLM 不可用时确定性模板降级；L1 strict Pydantic + L2 业务校验（判环/孤立/深度≤4）
- 服务 token 鉴权（hmac 恒定时间比较）；回调主服务 3 次指数退避（**best-effort，无死信队列**）；HMAC 双端签名 TODO
- run 注册表**内存态**（进程重启即失效，TODO 持久化）
- **零测试**（pyproject 已配 pytest asyncio，无 tests 目录）
- 评估/应急/执行/周报四类 AI 能力仅有主服务侧确定性引擎占位，AI 服务侧未实现

## 1.4 运维与工程化

- `deploy/docker-compose.yml` 自定位为**本地开发栈**：web 容器跑 Vite dev server（生产构建层整段注释掉）；无 restart 策略、无资源限制、无日志轮转、无备份、无反向代理/TLS、minio 用 `latest` tag、凭据默认值硬编码；此外 web 的 `package.json` 构建目录为 `dist-mvp-8`，Dockerfile 注释仍指向 `dist-mvp-2`，生产镜像启用前必须统一产物路径
- CI 仅 3 个 job（lint/build/test），无服务容器（集成测试不起 pg/redis）、无 CD、无镜像发布；文件头自列 5 条 TODO（OpenAPI 快照、租户隔离集成测试、迁移回滚验证、AI pytest+eval、Playwright E2E）
- 生产化完全缺失项：**版本化迁移、备份/恢复、监控告警、Sentry 初始化（DSN 只声明）、secrets 管理、限流配置、Rate limit/Backup 环境变量**
- `DELIVERY/`（《OpenSchedule 完整开发方案》）被 readme 引用但**不在仓库内**——方案正本需确认归档位置
- `knowledge/` 目录是方法论素材库，**不属于本产品资产**，写码时不得当作本项目实现引用

## 1.5 差距总览（一张图）

```
演示可用 ✅ ──────────────────────────────► 生产上线 ❌
┌───────────────┬────────────────────────────────────────────┐
│ 已经很好       │ 数据迁移(无) · 通知外发(占位) · 限流(无)      │
│ 领域建模/schema│ 事件零消费 · 幂等/refresh 内存态 · 测试(集成无)│
│ 状态机/审计/租户│ 前端 mock 默认开 + 三套数据体系 · PWA 移除    │
│ 契约/RBAC 底子  │ CI 无集成/CD · compose 是 dev 栈 · 无监控备份 │
│               │ 双鉴权并存 · AI 回调无死信 · 零观测接入        │
└───────────────┴────────────────────────────────────────────┘
```

---

# 2. DDD 战略与战术设计

## 2.1 领域划分（核心域 / 支撑域 / 通用域）

```
┌──────────────────────────────────────────────────────────────┐
│ 核心域（产品差异化，投入最大）                                    │
│   计划与执行域   计划拆解/派工/承接/计时/状态机/依赖/临期          │
│   AI 协作域     拆解草稿/评估/应急提议 —— 「提议-审批」闸门        │
├──────────────────────────────────────────────────────────────┤
│ 支撑域（必要但不差异化）                                          │
│   协作域 评论/提及/附件 · 通知提醒域 · 个人计划域                  │
│   模板自动化域 · 开放集成域(APIKey/Webhook/日历/IM) · 评估报表域    │
├──────────────────────────────────────────────────────────────┤
│ 通用域（业界标准做法）                                            │
│   租户身份域 · 权限域(RBAC) · 审计域(append-only) · 系统管理域      │
└──────────────────────────────────────────────────────────────┘
```

## 2.2 限界上下文（Bounded Context）与现有模块映射

| # | 限界上下文 | 聚合根（粗体） | 现有模块/表 | 上下文职责边界 |
|---|---|---|---|---|
| BC-01 | 租户与身份 | **Tenant**、**User**、MemberProfile | modules/auth、users；tenants/users/member_profiles | 注册/登录/会话/成员画像。对外只暴露用户只读视图 |
| BC-02 | 权限 | **Role**、UserRole | modules/rbac；roles/user_roles | 四层 RBAC（system/tenant/project/task），权限点单一事实来源 `permissions-matrix.yaml` |
| BC-03 | 计划与执行 | **Project**、**Task**、TaskDependency、TimeEntry | modules/projects、tasks、assignments、dependencies；projects/tasks/task_dependencies/time_entries | 唯一持有任务状态机（T1–T13）与依赖拓扑的上下文 |
| BC-04 | 个人计划 | **PersonalTask** | personal_tasks（表已建，模块未建） | 个人任务 CRUD/计时/关联团队任务（linkedTaskId 预留）⚠️ 独立模块 personal-tasks 待建 |
| BC-05 | 协作 | **TaskComment**、Attachment | modules/comments、attachments、search | 评论串/提及/决策标记/附件/全局搜索 |
| BC-06 | AI 协作 | **AiProposal** | modules/proposals；ai_proposals | 提议生命周期（pending→approved→applied/rejected/expired）；apply 原子落库；AI 回调入口 |
| BC-07 | 通知与提醒 | **Notification**、**Reminder** | modules/notifications、reminders；notifications/notification_deliveries/notification_preferences/reminders | 站内信箱 + 外发路由（email/push/im）+ 投递重试 + 延迟提醒 |
| BC-08 | 模板与自动化 | **ProjectTemplate**、**AutomationRule** | modules/templates、automation；project_templates/automation_rules | 模板快照/克隆、规则引擎（触发器接线后生效） |
| BC-09 | 开放集成 | **ApiKey**、**Webhook**、CalendarAccount | modules/api-keys、webhooks、calendar、integrations | 对外 API Key、Webhook 签名外发、日历双向同步、IM 出口 |
| BC-10 | 评估与报表 | （无聚合，读模型为主） | modules/evaluations、reports、health、resource-pool、summaries | 纯函数引擎 + 读模型聚合；评估/健康/资源池/周报 |
| BC-11 | 审计 | AuditLog（append-only） | modules/audit + common/audit；audit_logs | 横切上下文：只插入不更新不删除；查询服务 |
| BC-12 | 系统管理 | （无表） | common/health、common/storage、common/redis | 健康探针/对象存储/缓存等系统级设施 |

**上下文地图（协作关系）**：

```
                 ┌─────────────┐
                 │  BC-01 身份  │◄─────────────┐
                 └──────┬──────┘              │
                        │ 用户只读视图           │
        ┌───────────────┼───────────────┐      │
        ▼               ▼               ▼      │
  ┌───────────┐   ┌───────────┐   ┌───────────┐│
  │ BC-02 权限 │   │ BC-03 执行 │   │ BC-04 个人 ││
  └─────┬─────┘   └─────┬─────┘   └─────┬─────┘│
        │ 权限点校验      │ 领域事件        │      │
        │              ▼               │      │
        │       ┌───────────┐          │      │
        └──────►│ BC-07 通知 │          │      │
                └─────┬─────┘          │      │
                      │ 领域事件          │      │
        ┌─────────────┼─────────────┐   │      │
        ▼             ▼             ▼   ▼      │
  ┌───────────┐ ┌───────────┐ ┌───────────┐    │
  │ BC-05 协作 │ │ BC-06 AI  │ │ BC-08 模板 │    │
  └───────────┘ └─────┬─────┘ └───────────┘    │
                      │ 回调(防腐层)             │
                      ▼                        │
              ┌───────────┐                    │
              │ AI Service │────────────────────┘
              │ (外部系统)  │  服务 token + Idempotency-Key
              └───────────┘

  BC-09 开放集成 ──接收──► BC-03 执行（API Key 入口，走 BC-02 鉴权）
  BC-10 评估报表 ──订阅──► BC-03 领域事件（只读模型）
  BC-11 审计 ◄──所有写上下文（事务内同步写入）
```

**集成规则（不可违反）**：
1. BC 之间只许：① service 层显式调用（同进程内）② 领域事件（进程内总线，未来可换消息队列）③ HTTP 防腐层（对 AI Service / IM / 日历等外部系统）
2. 禁止跨 BC 直接查对方的表；读模型需求走对方 service 或事件投影
3. AI Service 是**外部系统**（防腐层：服务 token + Idempotency-Key + HMAC 签名 + 超时/重试/死信）

## 2.3 聚合与不变式（战术设计）

### BC-03 计划与执行（核心）

**聚合根 Task**（表 `tasks`，生命周期 = 显式状态机；下列为目标不变式，现状未全部满足）
- 状态机：以 `common/constants/task-status.ts` 的 T1–T13 为唯一权威。基础路径为 `todo → in_progress → blocked/done`，`done → todo/in_progress`；`pending_review` 为 Phase 2 扩展态。不能把状态图简化为“任意状态可重开”，非法迁移返回 40902
- 不变式：
  - INV-1 领取 T1 必须在同一事务中以乐观锁完成 `assigneeId` 占位并迁移为 `in_progress`；未分配任务也允许项目负责人/租户管理员按 T2/T8 规则阻塞或取消，不能假设“未分配只能 todo”
  - INV-2 T4/T7 完成必须带 `actualHours ≥ 0`，并写 `completedAt`
  - INV-3 任务树深度 ≤ 4，禁止 parent 环
  - INV-4 所有状态变更携带 `version` 乐观锁，冲突 40901
  - INV-5 `source=submission` 的任务必须经 `submissionStatus=approved` 才进入可执行看板（Phase 4 提报）
- 子实体：TimeEntry（计时累计进 actualHours）；值对象：TaskDependency（FS/SS/FF/SF + lagDays，跨聚合引用，仅持 id）
- 领域服务：`AssignmentsService`（领取/转移，跨 Task 与权限语义，独立成服务不挂聚合）

**聚合根 Project**：不变式 `status=archived/completed` 后禁止新增任务；`ownerId` 派生项目级角色；`deadline` 是临期检测（health 上下文）的输入。

### BC-06 AI 协作

**聚合根 AiProposal**
- 独立状态机：`pending → approved → applied | rejected | expired`；`approved 未 applied 不产生业务副作用`
- 不变式：
  - INV-6 apply 必须原子（单事务：写 tasks + 依赖 + 标记 proposal.applied + 审计），失败整体回滚
  - INV-7 `expiresAt` 到期自动 expired（默认 72h，可配置）并通知提议人
  - INV-8 apply 必须持久化 proposal 与实际创建/更新的 `taskIds` 的可查询关联，并定义撤销边界；当前 schema 尚无独立关联表，R1/R3 必须补 `ai_proposal_tasks`（或等价的版本化应用记录），不能仅依赖不可审计的 JSON
- 值对象：payload（严格 schema，版本化）、diffSummary

### BC-07 通知与提醒

- **Notification** 聚合（含 NotificationDelivery 子实体）：投递状态机 `pending → sent | failed`，重试退避由 retry-policy 纯函数决定；外发失败发布 `notification.failed`
- **Reminder**：`scheduled → fired | cancelled | failed`；触发双保险（Redis zset 主 + DB 扫描兜底），`fire()` 原子认领防双路径重复
- NotificationPreference 是**每用户唯一聚合**（eventType 通配默认项）

### BC-01/02 身份与权限

- **User** 系统级（无 tenant_id）；**MemberProfile** 租户级，与 User 一对一（`@@unique([tenantId, userId])`）
- **Role** 模板可克隆（tenantId NULL = 系统级）；**UserRole** 四层 scope（scopeResourceId 空 = 租户级）
- 授权决策：角色实时派生（不读 token 声明），权限变更即刻生效；人员域三角色矩阵见 `docs/contracts/personnel-permission-matrix.md`（default-deny）

### 值对象命名约定（新增代码必须遵守）

| 值对象 | 字段 | 校验 |
|---|---|---|
| TimeWindow | startAt/dueAt | dueAt ≥ startAt |
| Estimate | estimatedHours | 0 < x ≤ 1000，1 位小数 |
| TaskTitle | title | ≤ 200 字符（DB 300 留余量） |
| RichContent | content | ≤ 5000 字符，XSS 安全 |
| CronLike / TriggerConfig | triggerConfig | 按 triggerType 分支校验 |

## 2.4 分层与代码落位约定

```
Controller（入参校验/DTO/权限装饰器）
   └──► Application Service（用例编排、事务边界、审计、事件发布）
          └──► Domain（聚合/状态机/纯函数引擎/领域服务/不变式）── 不依赖 Prisma/HTTP
                 └──► Infrastructure（PrismaService / Redis / S3 / 外部适配器）
```

- **现有模块的 controller/service 合并写法**（如 tasks.service 直接写 Prisma）在生产化重构中逐步抽离领域纯函数：状态机、依赖判环、评分、重试策略已是纯函数 ✅，保持；新写业务规则优先落纯函数 + spec
- 领域事件 payload 的**唯一契约来源**应落 `packages/domain-events`（新建，见 R2）——目前 events/*.ts 头部 TODO 已指明此方向
- 双鉴权收敛目标：**JWT Bearer 为唯一对外鉴权体系**（决策 D-01，见 §6）

## 2.5 领域事件目录（现状 + 生产化补全）

现有（只发不收）：`task.created / task.assigned / task.status_changed / task.completed`、`project.updated / project.archived`、`task.comment_created / mention.parsed`、`reminder.due`、`notification.failed`

生产化必须补的**订阅关系**（R3 接线）：

| 事件 | 订阅者（BC） | 用途 |
|---|---|---|
| task.created / task.assigned | BC-07 通知 + BC-08 自动化触发器 + BC-03 站内 WS | 通知当事人、规则触发、看板实时刷新 |
| task.status_changed（blocked>3d） | BC-07 升级通知（tasks.service:642 TODO） | 阻塞升级 |
| task.completed | BC-10 评估/报表投影 + BC-08 自动化 | 完成率/准时率计算（MemberProfile 不落表，聚合计算） |
| task.comment_created / mention.parsed | BC-07 提及通知 | @提及外发 |
| reminder.due | BC-06 AI 应急输入 | 临期偏差 → 应急提议 |
| notification.failed | BC-07 重试 worker（notifications.module TODO） | 退避重试闭环 |
| ai.proposal.expired | BC-07 通知提议人 | 审批超时提醒 |
| project.archived | BC-08 模板快照候选 | 转模板入口 |

**可靠性要求**：事件消费不得丢——进程内总线 + 「关键副作用必须可由 DB 兜底扫描补偿」原则（如提醒双保险同思路）。引入 Outbox 模式列入 R3 备选（多实例/跨进程时必选）。

---

# 3. 生产化差距拆解（现状 → 目标 → 任务 → 验收）

## 3.1 数据与迁移（🔴 阻塞上线）

**现状**：无 `prisma/migrations/`；`main.ts` 启动 `prisma db push --skip-generate`；README 称「迁移文件随仓库提交」但实际缺失；DB_AUTO_MIGRATE=true 时也只是 db push。

**目标**：版本化迁移是唯一 DDL 变更路径；CI 校验迁移与 schema 一致；生产使用 expand/contract 保持应用可回滚；破坏性变更以备份恢复/PITR 兜底，不能依赖未经验证的 down migration；生产流水线单独 `prisma:deploy`。

**任务**：
1. 先对现有开发库做逻辑备份并用 `prisma migrate diff` 核对漂移；从空库生成 baseline SQL，建立唯一 baseline migration；对已经由 `db push` 创建且确认一致的环境用 `prisma migrate resolve --applied`，禁止未经确认的 `migrate dev` 自动 reset 共享环境2. `main.ts` 删除 `db push` 分支，改为：生产 APP_ENV=production 时禁止应用启动时改 DDL；迁移由发布流水线单独执行 `prisma migrate deploy`，并在 schema 版本未达标时拒绝接流量；开发环境也优先 `migrate deploy`，不再以 db push 作为正常路径
3. schema 尾部 6 模型风格统一（uuid(7)/@map/timestamptz(6)）；补齐 `ai_proposal_tasks`（或等价应用记录）、凭据密文/密钥版本字段，并修正可空列唯一约束——这些都必须有正式 migration
4. 补 gin_trgm_ops 索引（title/description/name/content）migration
5. CI 增加 migration job：fresh DB → `migrate deploy` → schema/migration 状态校验 → expand/contract 应用回滚兼容性验证 + 备份恢复演练；不要伪造一个不存在的通用 rollback 命令

**验收**：空库 `pnpm prisma:deploy` 一次到位；`prisma migrate status` 干净；schema 与迁移目录无漂移；应用旧镜像在新 schema 上可启动（expand/contract）；恢复演练可从备份恢复到指定时间点；每个后续 PR 的 schema 变更必须带 migration 文件。

## 3.2 功能完成度（🟠 上线必需）

| 缺口 | 任务 | 验收 |
|---|---|---|
| 通知外发三通道占位 | 选型并实装 EmailAdapter（SMTP 供应商决策见 D-04）；ImAdapter 接 integrations 的 im-adapters（含 webhook 签名）；PushAdapter 做 VAPID 可用性 POC 后实装或明确首发不做 push | 三通道各有真实发送 + 失败落 delivery.lastError；偏好路由/免打扰单测 ≥10 例 |
| notification.failed 监听 + 重试 worker 未接线 | 注册 @OnEvent 监听，接 notifications-retry.worker；退避策略已有 retry-policy 纯函数 | 外发失败自动重试并按退避排程；终败置 failed 且可查 |
| 邀请加入端点未建 | `POST /auth/invite` + 邀请 token 流转（管理员发邀请 → 邮件送达 → 受邀人设密入租户）；或首发降级为「管理员代建账号 + 首次登录改密」（二选一，见 D-05） | 完整 onboarding：建租户→邀成员→成员登录→分角色 |
| 多租户切换 | 首发建议保持「单租户语义 + 明确产品文案」，加入 `/auth/me` 返回租户列表与切换端点列入 P2 | 产品确认（D-06） |
| 自动化触发器未接线 | tasks.service 状态迁移完成后发布事件 → automation rule-engine 消费（触发器白名单：task.created/status_changed/completed） | 内置 2 条系统规则演示闭环（如 done 自动通知 creator） |
| 阻塞>3 天升级 | tasks.service:642 TODO：blocked 状态迁移时记录时间戳，定时扫描（reminder worker 同模式）发升级通知 | 阻塞 72h 自动通知项目负责人 |
| WS 实时刷新 | 实装 @WebSocketGateway（房间=tenantId[:projectId]）；事件发布处同步广播（boardStore 已有订阅 TODO） | 看板/通知/评论多浏览器实时同步；断线重连恢复 |
| 个人计划模块未建 | 新建 `modules/personal-tasks`（PersonalTask CRUD/计时/完成/关联团队任务）；前端 localStorage 个人计划迁移 | `/me/today` 全量走真实 API |
| 协作工作台 localStorage 体系 | 决策：转真实后端（新表 task_proposals/calendar_plans/task_experiences/sop_documents/wiki_articles/pomodoro_sessions/skill_drafts，见 workspace-features.md 接入建议）或下线该功能集（D-07） | 决策记录 + 执行 |
| AI 能力面 | 首发保留 decompose；evaluate/emergency/weekly 走主服务确定性引擎（已有占位）；AI 服务侧扩展列入 P2 | 产品口径一致：AI 提议-审批闭环可用 |

## 3.3 安全（🔴 上线门禁）

| 缺口 | 任务 | 验收 |
|---|---|---|
| 无限流 | 接 @nestjs/throttler（Redis 存储，与 idempotency 共用 Redis 基建）；登录/注册/refresh 单独紧阈值（如 5 次/分钟/IP）；42901 错误码已有 | 压测登录接口触发 429；其他接口按租户+IP 分档 |
| 无安全响应头 | helmet（或手写中间件）+ 收敛 CORS（生产白名单只含正式域） | 安全扫描（如 OWASP ZAP baseline）通过 |
| refresh token 内存态 | 改 Redis 存储：refresh rotation（每次刷新换新 + 旧 token 立即吊销）+ 用户禁用/角色变更时按 userId 批量吊销 | 多实例下刷新可用；旧 refresh 重放被拒；禁用用户 token 即刻失效 |
| 幂等内存态 | IdempotencyInterceptor 换 Redis 实现（TTL 24h，key=tenant+user+Idempotency-Key） | 双实例部署重复提交只落一次 |
| 上传安全 | attachment-policy 已有大小/类型白名单；补：magic number 嗅探、图片重压缩、object_key 强制 tenant 前缀（已做）、下载鉴权（不暴露永久公网 URL，改短时预签名） | 伪造扩展名文件被拒；跨租户下载 403 |
| Webhook SSRF | webhooks 外发前 URL 校验（禁内网/环回/元数据地址 169.254.0.0/16 等）+ 出站超时 + 重放保护（HMAC 签名已有 webhook-signer） | SSRF 测试用例（内网地址被拒） |
| AI 回调加固 | HMAC 双端签名（ai-callback DTO 加签名头，主服务验签；TODO 已在 AI 侧标注） | 伪造回调被拒 |
| 凭据治理 | 生产 secrets 不入仓库不入 compose 环境明文（K8s Secrets / docker secrets / 云 KMS，部署形态见 R10）；所有 change-me 强制启动检查（现 ENCRYPTION_KEY 等缺失应 fail-fast 而非运行期炸） | 启动时缺失生产必需密钥 → 拒绝启动并报出变量名 |
| 审计完备性 | 扫一遍写路径：确认所有写操作落 audit_logs（@Audited 覆盖检查，重点 proposals.apply、assignments、automation 规则变更、api-keys/webhooks 管理） | 审计断言测试（DoD：审计断言） |
| 依赖与镜像 | 锁基础镜像 tag（minio、postgres、redis 均固定 minor）；pnpm --frozen-lockfile 全链路；定期依赖审计进 CI（npm audit / pip-audit） | CI 新增 audit job（可设非阻塞告警起步） |

## 3.4 可靠性与一致性（🔴 多实例前提）

1. **后台任务队列化**：BullMQ 接已装依赖；reminders.worker 的 setInterval → repeatable job；notifications 重试 → delayed job；calendar 同步 → queue。保留 DB 兜底扫描思路（queue 挂了提醒不丢）
2. **事件零消费治理**：按 §2.5 表接线；事件总线进程内 OK（单体内），但关键事件（通知、自动化）的副作用必须可由扫描兜底；预留 Outbox（R3 评估）
3. **AI 回调可靠性**：回调失败死信队列（AI 侧重试 3 次后落本地死信表/文件 + 告警）；主服务 `/internal/ai/results` 幂等消费（Idempotency-Key 去重已有约定）
4. **健康检查分层**：`/health`（liveness，轻）与 `/health/ready`（readiness，探 DB+Redis+存储）分离；compose/k8s 探针分别使用
5. **优雅停机**：enableShutdownHooks 已有；队列 worker 停机 drain；SSE 连接关闭语义
6. **DB 连接池**：DB_POOL_MAX=10 起步合理；补充 pgbouncer 评估（多实例直连数）；慢查询日志（>500ms）+ 定期 pg_stat_statements 回顾
7. **Redis 高可用**：懒连接已有降级设计；补重连退避参数（redis.service TODO）；Redis 挂了提醒走 DB 兜底（已设计）✅

**验收**：杀掉任一后台 worker 进程，无消息丢失（DB 兜底可重放）；双实例启动幂等/刷新/通知均正常。

## 3.5 性能（🟡 上线前达标即可，持续优化 P2）

| 项 | 现状/目标 | 任务 |
|---|---|---|
| N+1 查询 | 未审计 | 对 tasks tree、comments thread、notifications list、calendar mappings 做 `prisma $queryRaw`/日志审查；必要处 `include` + 批量 |
| 关键索引 | 大部分已有；搜索缺 gin_trgm | §3.1 任务 4；评估 `(tenant_id, assignee_id, status)` 复合索引覆盖看板查询 |
| 前端包体积 | 无代码分割，vis-network/antd 全量 | 路由级 lazy + 手动 chunk（antd 按需已有 esm）；vis-network 仅 Wiki 页动态 import |
| 大租户列表 | pageSize≤100 已有 | 看板列内任务数软上限 + 虚拟滚动评估（>200 卡） |
| 压测基线 | 无 | k6 脚本：登录、看板读、任务状态迁移、通知列表 4 条链路；目标见 §4 SLO |

## 3.6 可观测性（🟠 上线必需）

1. **结构化日志**：pino（NestJS Logger 替换），json 输出；requestId 贯穿（request-id.middleware 已有 → 日志上下文）；worker/队列日志带 jobId
2. **Sentry**：SDK 初始化（API + Web + AI 三端）；release 关联 CI commit sha；sourcemap 上传
3. **指标**：Prometheus `/metrics`（http 请求数/时延、DB 池、队列深度、通知外发成功率、AI 回调失败率、LLM 成本累计）——`LLM_MONTHLY_BUDGET_ALERT` 已有预算告警语义，需落地成真实告警
4. **审计查询**：audit-query.service 已有；补常用查询索引复核 + 前端审计页只读视图（已有 AuditPage）✅
5. **告警规则**：错误率>1%/5min、P95>800ms、队列积压>1000、通知外发失败率>10%、AI 回调死信>0 → 通知运维通道
6. **日志留存**：应用日志 30 天滚动；audit_logs 按季度分区（>100 万行后）

## 3.7 测试与质量（🔴 CI 门禁）

| 层 | 现状 | 目标 | 任务 |
|---|---|---|---|
| 后端单元 | 19 spec（纯函数）✅ 模式正确 | 保持，新领域规则必带 | 新代码沿用纯函数优先 |
| 后端集成 | 0 | 每个写模块 ≥核心路径集成测试（testcontainers pg+redis） | CI test job 起服务容器（ci.yml 模板已注释好）；重点：tasks 状态机+乐观锁、assignments 抢占、proposals apply 原子性、租户隔离 ≥5 用例（CI TODO#2）、幂等重放、审计断言 |
| e2e | 1（personnel-authz） | 主流程冒烟：登录→建项目→发布任务→领取→计时→完成→周报 | Playwright（CI TODO#5）；375px 视口清单进 DoD |
| 前端 | 0 运行时 | Vitest + RTL：关键页（登录/看板/今日/通知）组件测试 + api 层契约测试 | 装 vitest；mock 层转为测试 fixture 复用（而不是运行时回退） |
| AI 服务 | 0 | L1/L2 校验、降级模板、SSE 帧协议、回调重试、预算截断 | uv run pytest（CI TODO#4）+ decompose schema eval（strict 100 采样 ≥99%） |
| 契约 | openapi/*.yaml 4 份 | 全量 API 契约化 + 快照 diff 进 CI（CI TODO#1） | 评估 @nestjs/swagger 生成或手写 yaml 维护纪律，二选一并记录 |
| 迁移 | 无 | fresh + migrate deploy + schema 漂移检查 + expand/contract 兼容性验证 + 恢复演练 | §3.1 任务 5；Prisma 不提供可直接依赖的通用 down/rollback 命令 |

**覆盖率门槛**：新增代码行覆盖 ≥70%；核心域（BC-03/06/07）service 层 ≥80%。

## 3.8 部署与运维（🔴 上线交付物）

1. **生产编排**：`deploy/k8s/` 或生产版 compose（R10 决策 D-08）：reverse proxy（Caddy/nginx）+ TLS 终结、api/web/ai 三服务、pg、redis、对象存储（云 OSS/COS 或 MinIO operator）；restart: always、资源 requests/limits、日志 json-file rotate
2. **前端生产镜像**：启用 apps/web Dockerfile 被注释的生产层（nginx:alpine 托管静态产物 + `try_files` 回退 index.html）；删除 dev server 镜像路径
3. **CI/CD**：build/push 三端镜像（tag=sha+latest）；staging 环境自动部署；生产手动 gate；迁移以单独 job（prisma:deploy）先于应用滚动
4. **备份与恢复**（当前为零 🔴）：pg 每日全量（pg_dump/pgBackRest）+ WAL 归档 → PITR；MinIO/OSS 跨区复制或生命周期版本控制；Redis 不备份（可重建，队列消息可丢但 DB 兜底）；**恢复演练入 DoD**：备份 → 空机恢复 → 数据一致性校验脚本
5. **环境分层**：dev / staging / prod 三套变量；staging 用生产同构（小规格）；seed 数据仅 dev
6. **LiteLLM 部署**：网关独立部署（云或自建），配额/降级/预算告警在网关卡死（应用侧 LLM_BUDGET_* 是第二道）
7. **运行手册**：`deploy/runbook.md`：常见故障（DB 满、Redis 挂、队列积压、AI 回调死信、迁移失败回滚）处置步骤

## 3.9 前端专项（🟠 生产化主体工作）

**数据体系收敛（最大技术债，顺序执行）**：
1. `USE_MOCK` 默认改 false；mock 层从运行时删除，有价值的场景转为 Vitest fixture
2. localStorage 演示体系逐域决策（D-07）：工作台任务→BC-03 真实 API；Wiki/SOP/经验/提示词/Skill → 后端建模或下线；localStorage 角色切换 → 移除（以 `/auth/me` capabilities 为准）
3. 双鉴权收敛：人员域并入 Bearer 体系（D-01），sessionClient/CSRF 删除
4. 服务端状态全面切 TanStack Query（Provider 已配）：替换 useWorkspaceTasks/useNotifications 等自管理 hook，乐观更新沿用 boardStore 模式
5. **上线前必须清零的本地模拟**：改密码（PersonalProfilePage）、IM 转发（ForwardMessageModal）、aiGenerator 模板、useCurrentRole

**体验与工程**：
- 看板拖拽实装（dnd-kit，readme 原计划项）或明确首发用菜单移动；甘特拖拽接 PATCH
- 代码分割 + 构建目录收敛（dist-mvp-* 历史目录清理，固定 `dist`，emptyOutDir 恢复 true）
- 错误边界 + 全局 500/网络断连页；加载骨架补齐 EmptyView/ErrorView 已有 ✅
- PWA：首发不做；P2 以「SW 更新提示 + 版本化缓存」安全策略重做（D-09）
- i18n：locale 字段已有，文案硬编码中文；首发单语言可接受，记录决策

## 3.10 AI 服务专项（🟡）

1. run 持久化：运行记录落 Redis（含帧缓存），进程重启可恢复/可查询（decompose.py TODO）
2. 回调死信（§3.4.3）；HMAC 签名（§3.3）
3. 测试与 eval（§3.7）
4. LLM 降级链验证：LiteLLM 不可达 → 模板降级 → 前端可感知（degraded 标记已有 `degraded` 状态位 ✅）
5. 评估/应急/周报 AI 化：P2 排期（主服务确定性引擎先顶着）

---

# 4. 上线门禁与 SLO

## 4.1 Go / No-Go 门禁（全部 ✅ 才允许生产发布）

以下不是“建议项”，而是发布阻断条件。任何一项未完成，状态必须为 **No-Go**：

- [ ] §3.1 迁移基线入库，CI migration job 绿，空库一键建库验证过
- [ ] §3.3 安全清单全项关闭；渗透/基线扫描（ZAP）通过
- [ ] §3.7 集成测试（含租户隔离 ≥5、审计断言、幂等、apply 原子性）进 CI 且全绿
- [ ] §3.8 备份策略落地 + **至少一次恢复演练成功**
- [ ] §3.9 前端 USE_MOCK 默认 false、localStorage 演示数据清零、本地模拟点清零
- [ ] 三端 Sentry 接入、告警规则在 staging 验证触发过
- [ ] secrets 全量走密钥管理，仓库/compose 无明文
- [ ] runbook + 回滚预案（应用回滚 = 镜像 tag 回滚 + 迁移兼容性检查）

## 4.2 SLO（首发目标）

| 指标 | 目标 |
|---|---|
| 可用性 | 99.5%（月），健康探针按 §3.4.4 分层 |
| API 时延 | P95 < 500ms（读）/ < 800ms（写）；列表页首屏 < 2s |
| 错误率 | 5xx < 0.5% |
| 通知时延 | 站内 < 5s；邮件/IM < 60s |
| 提醒准时性 | 触发误差 < 30s |
| AI 拆解 | 成功率 ≥95%（含模板降级）；schema 合规 ≥99% |
| 备份 RPO/RTO | RPO ≤ 24h（PITR 后 ≤ 5min）；RTO ≤ 4h |

---

# 5. 分批施工计划（R1–R12）

> 每批 = 一张任务卡。批次内步骤有依赖顺序，批与批之间 R1→R12 建议顺序执行；R5/R6 可与 R3/R4 并行（不同工作面）。
> 每批 DoD：该批验收项全绿 + `pnpm lint`/`pnpm test` 通过 + 相关 CI job 绿。

### R1 数据迁移地基（1 周）🔴
- 任务：备份与漂移核对；baseline migration；schema 尾部模型统一；凭据/AI apply 记录模型；gin_trgm 索引；main.ts 移除 db push；CI migration + 恢复验证
- 验收：§3.1 全部（使用 expand/contract 和备份恢复，不假定 Prisma 存在通用 rollback）

### R2 共享契约与事件契约（3 天）
- 任务：建 `packages/domain-events`（事件 payload 类型 + 版本号），events/*.ts 改 re-export；评估 shared-types 范围（API DTO 类型是否共享，决策 D-10）
- 验收：事件类型单一来源；TS 编译全绿

### R3 可靠性骨架（2 周）🔴
- 任务：BullMQ 接线（reminders/通知重试/calendar 同步）；事件订阅按 §2.5 表接线（通知、自动化触发、阻塞升级、WS 广播）；幂等+refresh token 换 Redis；为关键事件引入 transactional outbox 或等价的可重放记录；Outbox 评估记录
- 验收：§3.4 全部验收项；多实例 docker compose 起双 api 验证；进程崩溃/重启后关键副作用可重放且不重复

### R4 安全基线（2 周）🔴
- 任务：throttler + Redis；helmet/CORS；refresh rotation + 吊销；上传 magic sniff + 预签名下载；webhook SSRF；AI 回调 HMAC；凭据 fail-fast；审计覆盖检查
- 验收：§3.3 全项 + authz 回归测试扩 5 例（租户隔离）

### R5 通知与提醒实发（1 周）🟠
- 任务：EmailAdapter 实装（D-04 选型）；ImAdapter 接 integrations；push POC（D-11）；failed 监听 + 重试 worker 接线；免打扰补发口径确认
- 验收：三通道真实投递截图级验证；退避重试测试

### R6 功能收尾（2 周）🟠
- 任务：邀请/成员 onboarding（D-05 方案）；personal-tasks 模块 + 前端迁移；自动化触发器 + 阻塞升级；WS gateway 实装
- 验收：§3.2 对应验收项

### R7 前端数据体系收敛（2 周，可与 R3-R6 并行）🟠
- 任务：USE_MOCK 默认 false + mock 层转 fixture；localStorage 体系按 D-07 逐域落地；双鉴权收敛（D-01）；TanStack Query 迁移；本地模拟点清零；代码分割 + dist 收敛
- 验收：§3.9 验收项；全局 grep `USE_MOCK`/localStorage 演示键仅剩测试 fixture

### R8 测试与 CI 门禁（持续，首阶段 2 周）🔴
- 任务：CI 起服务容器跑集成测试（租户隔离/审计/幂等/apply 原子性）；Playwright 冒烟；前端 Vitest 起步；AI pytest + eval；OpenAPI 快照；npm audit
- 验收：§3.7 表全项；PR 合并门禁生效

### R9 可观测性（1 周）🟠
- 任务：pino + requestId；Sentry 三端；Prometheus 指标 + 告警规则；慢查询日志
- 验收：staging 人为注入故障，告警按规则触发

### R10 生产部署与运维（2 周）🔴
- 任务：生产编排（D-08 k8s vs compose）；web 生产镜像；CD 流水线（镜像+迁移 job+staging 自动/prod gate）；备份 + **恢复演练**；LiteLLM 部署；runbook
- 验收：§4.1 门禁全绿；staging 与 prod 同构跑 1 周观察期

### R11 AI 服务加固（1 周，可与 R3 并行）🟡
- 任务：run 持久化（Redis）；回调死信（优先使用持久化队列/数据库，不使用仅本地文件）；HMAC；pytest 套件
- 验收：AI 服务重启后 run 状态和帧可恢复；主服务回调幂等；伪造回调被拒；死信可查询、重放、告警

### R12 上线冲刺（1 周）
- 任务：门禁核对；压测（k6 四链路）；种子/初始化数据脚本（首个租户创建）；灰度发布计划；应用镜像回滚 + 数据恢复演练
- 验收：§4.1 Go/No-Go 全过；staging 与生产配置经过发布演练

---

# 6. 风险登记册与待定决策（ADR）

## 6.1 待定决策与已拍板记录（✅ = 已定案，其余为建议默认）

| # | 决策 | 选项 | 建议默认 | 影响批次 |
|---|---|---|---|---|
| D-01 | 双鉴权收敛 | A. 全部收敛为 JWT Bearer（删 cookie 会话/CSRF）<br>B. 人员域保留 cookie + CSRF，其余 Bearer | **A**（安全面最小化；人员域前端改造成本约 2 天） | R4/R7 |
| D-02 | 生产编排形态 | A. 单机 compose 生产版（5-50 人团队规模足够）<br>B. k8s | **A 起步**，compose 文件分层 dev/prod；k8s 列 P2 | R10 |
| D-03 | 对象存储 | 云 OSS/COS vs 自托管 MinIO | 按部署环境，配置已抽象 ✅ | R10 |
| D-04 | 邮件供应商 | Resend / AWS SES / 阿里云 / SMTP 中继 | **已定（R5）：SMTP 中继抽象**。nodemailer 实装（465 隐式 TLS + 超时），供应商差异收敛在 `SMTP_HOST/PORT/USER/PASS + MAIL_FROM` 配置；本地开发 mailpit，生产供应商国内可达性 POC 前先用自建/中继 SMTP，切换零代码改动 ✅ | R5 |
| D-05 | 成员 onboarding | A. 邀请制（邀请 token + 邮件）<br>B. 管理员代建账号 + 首次登录改密 | **首发 B**（零外部依赖），A 列 P2 | R6 |
| D-06 | 多租户语义 | 首发单租户（取最早加入）+ 文案明示 | 维持现状，列入 P2 | R6 记录 |
| D-07 | localStorage 工作台体系 | A. 后端建模落地（6 组新表）<br>B. 功能下线/隐藏 | ~~倾向 B + 保留 Wiki 转 A~~ → **2026-10-17 定 A，分两期**：一期通用文档存储 workspace_items（已完成）；二期审批流等规则服务端化（上线前必做） | R7/R8 |
| D-08 | 部署目标 | 云主机 Docker / 云托管 K8s / 私有化交付 | 与 D-02 联动 | R10 |
| D-09 | PWA | 首发不做；P2 重做（SW 更新提示 + 版本化缓存） | 已按此执行（vite-plugin-pwa 已移除）✅ | — |
| D-10 | shared-types 范围 | 只放 domain-events，还是连 API DTO 一起共享 | 先 domain-events；DTO 共享待 mobile/web 双消费端需要时扩 | R2 |
| D-11 | WebPush | 首发做 / POC 后决定 / 不做 | **已定（R5）：服务端实装、默认关闭**。web-push + VAPID + aes128gcm 出站就绪（未配 VAPID 即不产生投递），PushSubscription 订阅存储 + REST API + SSRF 校验已落地；浏览器 SW 订阅流与国产浏览器可达性实测列 P2 ✅ | R5 |
| D-12 | 免打扰补发口径 | A. 窗口内直接丢弃<br>B. 挂起至窗口结束补发<br>C. 照常发送仅客户端静音 | **已定（R5）：B**。命中免打扰 → 外发挂起（delivery=pending，`nextRetryAt`=窗口结束，不消耗尝试次数），窗口结束由重试扫描补发；重试命中免打扰同样顺延；站内通知不受影响 ✅ | R5 |
| D-13 | 自动化事件消费口径 | A. task.created/status_changed/completed 三事件都订阅<br>B. 只订阅 created+status_changed，completed 由 status_changed(to=done) 覆盖 | **已定（R6）：B**。`applyTransition` 同事务双发布 status_changed(to=done) 与 completed，三件都订阅会二次触发；自动化只订阅 created+status_changed，completed 丢弃（§2.5「防订阅者收到两次」）✅ | R6 |
| D-14 | LLM 凭据归属与网关 | A. 部署方配 key，经 LiteLLM 网关<br>B. 按用户各自配置<br>C. 租户管理员统一配置，AI 服务直连厂商 | **已定（2026-10-21，用户拍板）：C**。管理员在「设置 → AI 模型」配置厂商/地址/模型/key（`tenant_llm_configs`，AES-256-GCM，响应/审计只露末 4 位，地址过 SSRF 守卫）；主服务拆解时随请求下发给 AI 服务（`DecomposeRequest.llm` exclude，不落盘），AI 规则/智能协助经 `POST /ai/complete`；**移除 LiteLLM**（部署零模型 key）。未配置 → 规则引擎。代价：失去网关级统一限流/计费，单次预算护栏留在 AI 服务 ✅ | R9-4 |

## 6.2 风险登记册

| 风险 | 等级 | 缓解 |
|---|---|---|
| baseline migration 与已存在的开发库漂移（本地库是 db push 建的） | 高 | R1 第一步：`prisma migrate diff` 核对 shadow db 与现有库，必要时开发库重建 |
| mock 层 1700 行删除后前端大面积回归 | 高 | R7 前先用 R8 的 Vitest 补关键页契约测试；mock 数据转 fixture |
| 事件接线遗漏导致通知缺失 | 中 | §2.5 订阅表为检查清单；每接线一个事件补集成测试 |
| LiteLLM/LLM 供应商不稳定 | 中 | 模板降级链已建 ✅；预算/告警双卡 |
| 通知供应商（邮件/IM）国内可达性 | 中 | D-04/D-11 POC 前置；站内通知兜底线永远可用 |
| 方案正本（DELIVERY/）缺失，部分口径无法核对 | 中 | 尽快归档入仓或确认放弃；本文件 §2 已固化关键决策 |
| 单点部署（单机 compose）故障即全停 | 中 | SLO 99.5% 匹配该形态；runbook 优先恢复 DB |
| 审计表无限增长 | 低 | 季度分区 + 归档策略（R9） |

---

# 7. 生产交付物清单与证据要求

> **原则**：生产可部署不是“代码编译成功”。每项必须有可复现的仓库文件、CI 记录、staging 运行证据或演练记录；没有证据就视为未完成。

## 7.1 必须存在的仓库交付物

| 交付物 | 最低要求 | 证据位置/验收方式 |
|---|---|---|
| 数据库迁移 | `services/api/prisma/migrations/`、baseline、后续增量 migration | `prisma migrate deploy` + `prisma migrate status` |
| 生产配置 | `deploy/production/` 或 `deploy/k8s/`，不得复用 dev compose | 配置 lint、secret 引用、资源/重启/日志/TLS 检查 |
| 前端生产镜像 | nginx/Caddy 静态托管、SPA fallback、固定产物目录 | 镜像启动后 `/`、深链、静态资源和 `/api` 访问成功 |
| 发布流水线 | 镜像构建、SHA tag、镜像扫描、迁移 job、staging deploy、生产审批 | GitHub Actions 成功记录 |
| 备份恢复 | PostgreSQL 全量/WAL/PITR 方案与脚本；对象存储版本/复制策略 | 在隔离环境完成恢复 + 行数/关键业务校验 |
| 运行手册 | `deploy/runbook.md`：发布、回滚、DB/Redis/队列/AI/证书故障 | 值班人员按文档演练成功 |
| 观测配置 | Sentry 初始化、指标、日志采集、告警规则、dashboard | staging 注入故障，告警到达指定通道 |
| 安全验证 | 依赖扫描、容器扫描、ZAP/等价 DAST、SSRF/租户隔离测试 | CI 报告无阻断级问题 |
| API 契约 | OpenAPI 与实现同步、破坏性变更检查 | CI snapshot/diff 通过 |

## 7.2 发布顺序（不可颠倒）

1. 冻结发布版本，生成 SBOM/镜像 digest，确认数据库备份成功且可读。
2. 在 staging 执行 migration；跑迁移、集成、E2E、契约、压测和安全门禁。
3. 生产执行备份确认 → `prisma migrate deploy` → readiness 检查 → 应用滚动/蓝绿发布。
4. 发布后观察错误率、P95、队列深度、通知失败率、DB/Redis 状态至少一个观察窗口。
5. 回滚应用只能回退到与当前 schema 兼容的镜像；若数据迁移不可逆，执行经过演练的备份/PITR 恢复，不得直接删除生产表或手工改 migration history。

## 7.3 生产启动阻断规则

- `APP_ENV=production` 时检测到 `change-me`、默认密码、缺失 JWT/加密/AI 服务密钥、`DB_AUTO_MIGRATE=true` 或不安全 CORS，必须 fail-fast。
- 生产 API 不得暴露 PostgreSQL、Redis、MinIO 控制台、AI 管理接口和内部回调接口到公网。
- AI 只允许从内网访问；主服务必须验证回调签名、时间窗和幂等键。
- 所有生产变更必须有 migration、回滚兼容说明、审计记录和可观察性验证。

---

# 8. 附录：领域事件目录 / 权限点 / 术语表

## 7.1 领域事件目录（机器可读约定）

- 事件名：`<bc>.<entity>.<past_tense>`（现有命名已符合：task.created 等）
- payload 必含：`eventId(uuid7)`、`occurredAt`、`tenantId`、`actor {id, type}`、`version`（schema 版本）
- 新增事件必须：① packages/domain-events 定义类型 ② 补本表 ③ 消费方集成测试

## 7.2 权限点与角色（单一事实来源）

- 机器可读矩阵：`services/api/src/openapi/permissions-matrix.yaml`（v1.0，三角色固化基线）
- 契约文档：`docs/contracts/personnel-permission-matrix.md`
- 四层 scope：system / tenant / project / task；角色实时派生；default-deny
- 变更流程：yaml + 契约 md + authz 实现 + 安全测试 + 前端能力映射 五处同步

## 7.3 错误码分段（沿用现有，不新增段）

400x 参数/校验 · 401x 认证 · 403x 授权 · 404x 不存在 · 409x 冲突（40901 乐观锁/40902 非法迁移）· 429x 限流 · 502/503 上游/不可用

## 7.4 术语表

| 术语 | 含义 |
|---|---|
| 大计划 | Project 的产品语义（团队计划单元） |
| 承接/领取 | A5 先到先得：todo→in_progress 原子占位 |
| 提议-审批门 | AI 输出只落 ai_proposals 草稿，人 approve 后 apply 才写业务表 |
| 铁律 | tenant_id 强制 / 软删 deleted_at / 写操作审计 三条数据纪律 |
| D# 断点 | 方案中 Phase 1 迁移必须就位的断点字段（D1–D7） |
| R# 批次 | 本文件 §5 的施工批次 |

---

> **给下一个 Agent 的交接语**：从 R1 开始按顺序做；每批开做前先读对应 §3 主题小节与 §6 决策表；遇到本文件未覆盖的口径歧义，以 `schema.prisma` 注释 + `docs/contracts/` 契约为准，并把新决策补进 §6 ADR。不要绕过租户铁律、审计铁律与 AI 审批门。
~