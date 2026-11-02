# OpenSchedule 生产化落地进度

> 依据：`docs/ddd/production-ddd-design.md` v1.1。本文只记录可复现的代码、测试和基础设施证据；没有证据的事项不会标记为完成。
>
> 最近更新：2026-11-01（**R8-13 推送 GitHub + CI 首跑全绿**：快进衔接上游 `3465504` 推送至 `Fatcattie/OpenSchedule`，首跑暴露并修复 4 个 Linux/PG16 专属缺陷（AI readme 与 Dockerfile 大小写、libpq 不认 Prisma `?schema=` 参数——**含生产 `pg-backup` 定时备份必败**、3 条新 high 依赖公告、PG 客户端版本错配），run `41296521906` **7/7 绿**；官方 PG16 空库 8 迁移 + 零漂移 + 真实库 e2e 19 例 + **首次备份→隔离库恢复→校验演练成功**，见 §R8-13。全仓基线 api 54 files / 501 tests、web 98、ai 179 + 1 skipped、门禁 18 项全绿）。
>
> 前次更新：2026-10-19（**R11 AI 服务加固**：run 持久化（redis/memory/auto）+ 重启后可恢复、回调 HMAC 签名 + `Idempotency-Key` + 退避重试 + 死信（可查询/可重放/可告警）、`/metrics` + 2 条 AI 告警，见 §R11；**R12 上线冲刺（离线可验证部分）**：四链路 k6 压测 + 阈值、首个租户种子幂等、灰度/回滚预案、Go/No-Go 核对表，见 §R12；**R10-2 staging 首次部署演练脚本**（迁移→起栈→冒烟→备份→隔离库恢复→回滚，11 步），见 §R10-2。全仓基线 api 50 suites / 472 tests、web 7 / 67、ai 164 + 1 skipped、typecheck/lint 全绿，`tests/qa/*` 11 门禁 + `tests/security`/`tests/authz` 7 门禁全绿）。

## 总览

| 批次 | 范围 | 状态 | 证据/备注 |
|---|---|---|---|
| R1 | 数据迁移地基 | CODE_COMPLETE / EVIDENCE_PARTIAL | 应用启动 DDL 已移除；baseline lock/schema/AI apply/备份脚本/CI 门禁已补；**2026-10-17 本地真实 PostgreSQL（`prisma dev`/PGlite）实测：空库 `migrate deploy` 7 个迁移一次到位、`migrate status` 干净、库⇄schema `--exit-code` 零漂移（修复 5 个 trgm 索引漂移）、迁移基线 e2e M-01..M-05 全过**（§R8-7）；**2026-11-01 GitHub Actions 官方 PG16 镜像实测（§R8-13，run `41296521906`）：空库 8 个迁移一次到位、`migrate status` 干净、漂移 `No difference detected`、首次备份 → 隔离库恢复 → 校验通过（哨兵行命中）**；剩余：AI apply 真实库集成断言、目标机恢复演练 RTO |
| R2 | 共享契约与事件契约 | DONE | `packages/domain-events` 为 payload 单一来源；6 个模块 events/*.ts 全部 re-export（无 TODO）；契约测试 10/10 通过（2026-10-01） |
| R3 | 可靠性骨架 | CODE_COMPLETE / EVIDENCE_PENDING | Outbox 事务内发布已接线（provider 注册 + BullMQ worker + DB 兜底双保险）；notification.failed 监听、AI 提议过期扫描、阻塞>72h 升级、/health/ready 分层已补；多实例 BullMQ 实跑与关键事件重放待环境证据 |
| R4 | 安全基线 | CODE_COMPLETE / EVIDENCE_PENDING | 安全核心主线已补：全局限流（登录 5/分钟/IP + 42901）、安全响应头、上传 magic number 嗅探、Webhook SSRF 防护 + MCP 出站超时、AI 回调 HMAC 验签、凭据列内 AES-256-GCM 加密、审计覆盖补全（proposals/automation/api-keys/webhooks/calendar）、authz 跨租户 IDOR 修复 + 5 例回归；**2026-10-17：租户隔离 e2e T-01..T-06 真实库通过（并修复 `runWithTenant`/`bypass` 惰性 PrismaPromise 失效缺陷）、HEIC/HEIF ftyp 嗅探补齐、`.git/config` 明文 PAT 已移除**（§R8-7）；多实例限流/SSRF 实跑待环境证据；**2026-10-18：Redis 宕机「请求全挂」根因已修复（有界重连 + 冷却，§R8-9），并实测单实例降级路径 5×401 → 42901（§R9-1）；多实例窗口一致性仍待环境** |
| R5 | 通知与提醒实发 | CODE_COMPLETE / EVIDENCE_PENDING | 三通道实装：email=nodemailer SMTP 中继（D-04）、im=integrations 出口（mcp 模式网关降级判失败）、push=web-push 端到端加密（D-11）+ PushSubscription 订阅存储/API；免打扰补发口径定案（D-12，挂起 pending 至窗口结束补发）；终败上限 8 次 + notification.failed §8.1 信封；单测 57 项（路由/免打扰/三通道真实投递集成）+ 门禁 FR-R5-01..09 通过；**厂商级真实投递（真实 SMTP/mailpit、真实 MCP 网关、真实浏览器推送服务）待环境证据** |
| R6 | 功能收尾 | CODE_COMPLETE / EVIDENCE_PENDING | R6-1 onboarding（adminCreateMember + changePassword + must_change_password）、R6-2 personal-tasks 模块（/me/tasks）、R6-3 自动化触发（事件监听 + 7 类动作 + 2 条内置规则 + D-13 completed 去重）、R6-4 WS 网关（socket.io + Bearer 鉴权 + tenant/project 房间）代码完成，36 suites / 348 tests 全绿；真实 PostgreSQL/浏览器端到端证据待 CI/数据库环境 |
| R7 | 前端数据体系收敛 | CODE_COMPLETE | R7-1 USE_MOCK 默认改 false；R7-2 修改密码/强制改密走真实 API；R7-3 workspace_role 本地角色切换清零；R7-4 imProvider/reportApi 裸 fetch/localStorage 清零；R7-5 mock 层 dynamic-import 隔离 + 路由级 lazy + 路由 vendor 拆分 + dist 收敛；R7-6 双鉴权收敛（cookie+CSRF → 统一 Bearer，sessionClient/CSRF 删除）；R7-7 TanStack Query 全量迁移（通知域 + 今日聚焦域）+ 4 处遗留 bug/契约修复（其中 PersonnelPage 密码 12→8 经复核为误报，已撤回）；DoD #4/#2/#5 满足，DoD #6（dist）已在 R7-5 满足。2026-10-11 实测 typecheck/test/test:cov/build/lint 全 PASS（45 tests）。**D-07 已拍板 A（分两期），一期 2026-10-17 完成（§R8-7：14 个 localStorage 集合全部落库），二期 2026-10-18 完成（§R8-8：审批命令 + 写入守卫 + 通讯录，工作台假身份清零）**；未满足 DONE 的条件：真实浏览器端到端证据 |
| R8 | 测试与 CI 门禁 | CODE_COMPLETE / EVIDENCE_PARTIAL | **R8-1** Vitest 起步（2026-10-09 完成）：apps/web 接入 vitest5 + RTL16 + jest-dom7 + jsdom30；PersonnelPage 7 用例 + useCurrentRole 10 用例 共 20 全绿；顺手修复 PersonnelPage Rules of Hooks bug。**R8-2** 覆盖率基线门禁 + CI web-test job（2026-10-10 完成，证据见 §R8-2）：阈值锁基线、per-file 高水位、TZ=UTC 固定、recurrence 16 例新锚点、lcov 产物归档。**R8-3** AI 服务 pytest 套件 + CI ai-test job（2026-10-10 完成，证据见 §R8-3）：services/ai 从 4 例补到 83 例（L1/L2 校验、LLM 错误分类、模板降级确定性、SSE 帧协议、重放窗口、服务 token 鉴权、端到端降级流），顺带修复 `_compute_depths` 越界 parent 崩溃 bug。**R8-5** mock 层转 fixture（2026-10-11 完成，证据见 §R8-5）：`src/api/mock/{handlers,data}.ts` → `src/__fixtures__/mock/`，`src/api/` 下不再持有演示数据（24 处引用改路径），生产构建仍无 mock chunk；顺带发现 `vite.config.js` 因解析顺序优先于 `.ts` 而实际生效（两者当前等价）。**R8-4** services/api jest→vitest 迁移（2026-10-12 完成，证据见 §R8-4）：37 suites / 369 tests 全绿，与 jest 基线一致且快约 14×（50s → 3.6s）；`jest`/`ts-jest`/`@types/jest` 与 `"jest"` 配置块全删，全仓 src 内 jest 引用 0；期间因 PowerShell 编码事故损坏 37 个 spec 中文（typecheck 906 错），已用 `dist/**/*.spec.js` 作逐字源完整恢复（U+FFFD 归零）。**R8-6** 上游移动端 APP 合入 + 集成修复（2026-10-16 完成，证据见 §R8-6）：三方合并（基线 `335a787`）引入 `apps/mobile` 全量（Expo 57 / RN 0.86，58 suites / 1013 tests 全绿）与附件 HEIC/中文文件名修复；上游 2 个 jest 风格 spec 适配 vitest（首个 Nest 容器级 spec 手动补 `design:paramtypes`）；mobile 补 `@types/node` 后 typecheck 通过；api 现 39 suites / 374 tests。**R8-7** D-07 一期 + CI 门禁补齐（2026-10-17，证据见 §R8-7）：OpenAPI 快照进 CI、依赖审计 job（critical 门槛，35→16 项且 0 critical）、api 覆盖率阈值 + lcov、e2e 迁 vitest 并接入 CI 真实库、漂移检查 `--exit-code`、domain-events 构建步骤与契约测试复活。**R8-8** D-07 二期（2026-10-18，证据见 §R8-8）：共享规则包 `packages/workspace-rules`、审核命令、写入守卫、通讯录、155 处假身份清零、Docker/CI 构建共享包。**R8-9** 契约切片 + Playwright 主流程冒烟（2026-10-18，证据见 §R8-9）：`/workspace/*` 三路由进 OpenAPI + ErrorBody 对齐真实信封 + 状态码漂移修复（5 切片 1.3.0）；真实 UI × 真实 API 12 步冒烟全绿。**R8-10** 依赖审计门槛提到 high（2026-10-18，证据见 §R8-10）：按可交付范围收敛的审计脚本，可交付范围内 ≥ high 归零，移动端工具链残余列为接受风险。**R8-11** `USE_MOCK` 双分支彻底收敛（2026-10-18，证据见 §R8-11）：请求层 21 模块 / 115 导出函数全部收敛到单点判定 `src/api/mock/dispatch.ts`（`mockOr`/`mockOrValue`/`mockOrMap`/`mockOrVoid`，处理器名受 `keyof MockHandlers` 约束），`src/api/**` 请求层 `USE_MOCK` 归零 + 新门禁 `tests/qa/web-mock-convergence.test.ts`；UI 层 14 文件/41 处 dev-only 播种仍读同一 config 开关（范围界定已记录）。**R8-12** decompose schema eval（2026-10-18，证据见 §R8-12）：离线 strict 基线 **100/100**（阈值 ≥99%）+ 16 例负样本逐条命中预期错误码 + L2 防御层 + 模板降级 27 组合全过；真实 LLM 采样门（`EVAL_LLM=1`）因无凭据跳过，用例随 CI `ai-test` 自动执行。**R8-13** 推送 GitHub + CI 首跑（2026-11-01，证据见 §R8-13）：修复 4 个 Linux/PG16 专属缺陷后 GitHub Actions **7/7 job 全绿**（run `41296521906`），真实库 e2e 19 例进 CI 通过。待做：真实 LLM 采样率、真实浏览器端到端进 CI |
| MOB | 移动端 APP（`apps/mobile`，上游并行开发） | CODE_COMPLETE / EVIDENCE_PENDING | 2026-10-16 自上游合入（增量 1–12：看板/搜索/附件/离线/i18n/暗色/审计脱敏等，过程文档见根目录 `overview-mobile-*.md` 与 `docs/mobile-app/`）；本地 jest 58 suites / 1013 tests、`tsc --noEmit` 均 PASS；**未纳入 R1–R12 设计范围**（设计文档 D-10 仅预留 mobile/web 双消费端），真机/EAS 构建与对接真实 API 端到端证据待环境 |
| R9 | 可观测性 | IN_PROGRESS | **R9-1 地基完成 + R9-2 告警/看板/上报完成**（2026-10-18，证据见 §R9-1 / §R9-2）：结构化日志（pino：JSON 输出 + 凭据脱敏 + 框架日志接管）、请求溯源访问日志（requestId 与 `X-Request-Id` 同源）、DB 慢查询日志与指标同源、Redis 降级事件计数、`/metrics` Prometheus 端点（RED + 运行时默认指标）；Prometheus 抓取配置 + **10 条告警规则**（R9 八条 + R11 两条 AI）、Grafana 看板与 provisioning、compose `observability` profile（`pnpm docker:obs`）、Sentry 5xx 上报（Envelope 直连，零依赖）。本机实测：`/metrics` 200（123 条 `openschedule_*` 序列）、访问日志携带 requestId、慢查询 `db_slow_query`+计数、`system_events_total{event="redis_degraded"}`、`METRICS_ENABLED=false` → 404、真实 3 个 500 → 3 条 Envelope（`X-Sentry-Auth` + 真实 V8 栈 + `request_id` 与响应/日志一致）、4xx 不上报。**R9-3（2026-10-21，§R9-3）**：web/ai 两端 Sentry 接入 + Alertmanager → alert-bridge → 飞书/钉钉/企业微信通知通道。**R9-4（2026-10-21，§R9-4，D-14）**：团队 AI 模型由管理员在设置页统一配置（key 加密、去 LiteLLM），项目拆解 / AI 规则 / 智能协助真正接通模型。待做：三端真实 DSN 端到端、真实群机器人投递、指标看板实跑、链路追踪 collector |
| R10 | 生产部署与运维 | IN_PROGRESS | **R10-1 开工完成**（2026-10-18，证据见 §R10-1）：**D-02 = A 单机 compose / D-08 云主机+Docker** 落地——`deploy/docker-compose.prod.yml`（仅 caddy 发布 80/443、镜像不可变 tag、8+ 项密钥 `${VAR:?}` fail-fast、restart/资源上限/日志轮转、`migrate`+`pg-backup` 运维 job、observability profile）、web 生产镜像（`apps/web/Dockerfile` 的 `prod` 目标 = nginx 托管 `dist` + `VITE_USE_MOCK=false`、`deploy/web/nginx.conf`）、`deploy/caddy/Caddyfile`（自动 TLS + 四路由 + HSTS + 公网 /metrics 403）、`deploy/litellm/config.yaml`（凭据全环境变量）、CD `release.yml`（三镜像→迁移 job→staging 自动→production 人工审批 gate→冒烟）、`deploy/.env.production.example`、`docs/ops/runbook.md`（**10 条告警处置** + 回滚三层 + 恢复演练）、新门禁 `tests/qa/deploy-prod-gates.test.ts`。**R10-2 staging 首次部署演练脚本**（§R10-2）：`deploy/drill/run.mjs` 11 步（preflight/config/images/migrate/up/ps/smoke/backup/**restore**/rollback/report）+ `docs/ops/staging-drill.md`，一次关闭 §4.1 #1/#3/#4 的「从未实跑」；本机仅 `--dry-run` 证据。**R10-3 服务器初始化**（2026-10-22，§R10-3）：`deploy/server/bootstrap.sh`（Debian/RHEL 系多发行版兼容）+ `gen-env.sh`（本机生成密钥、只补空值）。**阻塞**：本机无 Docker/k8s，编排/CD/恢复演练均未实跑（静态契约 + YAML 结构验证）；staging/prod 同构观察期未开始 |
| R11 | AI 服务加固 | CODE_COMPLETE / EVIDENCE_PARTIAL | **代码侧全部完成**（2026-10-19，证据见 §R11）：run 持久化（`AI_RUN_STORE=auto\|redis\|memory`，键 `osai:*` + TTL + 帧上限 LTRIM + `recover_orphans` 启动清扫，redis 连不上 fail-fast / auto 降级 memory 打 `ai_run_store_degraded`）；**重启后可恢复**（无内存态时从存储重放已发帧，未终结补 `AI_RUN_INTERRUPTED`）；回调 HMAC-SHA256 签名（与主服务 `ai-callback-signature.ts` 逐字对齐）+ `Idempotency-Key: ai-run:<run_id>` + 指数退避（上限 8s）+ 永久 4xx 停止重试；**死信**（`GET /ai/dead-letters`、`POST /ai/dead-letters/{id}/replay`，无本地文件后端）；**死信可告警**（`/metrics` + Prometheus `openschedule-ai` job + `AiCallbackDeadLetters`/`AiRunStoreDegraded`）；env/compose 落地 + 新门禁 `tests/qa/ai-hardening-gates.test.ts`；ai `uv run pytest` **164 passed + 1 skipped**。**阻塞**：真实 Redis 下的跨进程重启恢复、真实主服务回调幂等事务、真机压测为环境证据 |
| R12 | 上线冲刺 | CODE_COMPLETE / EVIDENCE_PENDING | **离线可验证部分全部完成**（2026-10-19，证据见 §R12）：k6 四链路压测（`qa-load/k6/01-auth`、`02-workspace-read`、`03-workspace-write`、`04-task-flow`）+ 阈值 + `qa-load/run.mjs`（静态校验与报告）；首个租户种子 `scripts/seed-first-tenant.mjs`（幂等，`--selftest` 全绿）；灰度发布与回滚预案 `docs/ops/release-plan.md`（9 项前置检查 + 双路径灰度 + 冻结期 + 决策树 + expand/contract）；Go/No-Go 逐项核对表 `docs/ops/go-no-go.md`（8 项 §4.1 映射，当前结论 No-Go）；新门禁 `tests/qa/load-and-seed-gates.test.ts`。**阻塞**：真实压测数值、真实 staging 告警触发、真实 DSN/ZAP、恢复演练 RTO 均为环境证据 |

## R1 数据迁移地基

### 已完成代码项

- [x] 应用启动不再执行 Prisma DDL；迁移入口改为显式命令。
- [x] 根包与 API 包增加 `prisma:status`、`prisma:diff`、`prisma:validate` 显式入口。
- [x] `.env.example`、API 环境样例和部署说明改为“迁移独立执行”口径。
- [x] Prisma migration lock 修正为 `migration_lock.toml`，并补充 AI proposal task FK 的前向兼容 migration。
- [x] AI proposal apply 在同一 transaction 内写入 `AiProposalTask` 审计关联及字段快照。
- [x] PostgreSQL `pg_dump`/`pg_restore`/verify 脚本（Linux/CI 与 PowerShell）已加入。
- [x] CI migration job 已加入备份、隔离恢复和哨兵数据校验步骤。
- [x] R1 静态 QA 契约、API typecheck、全量 API 单测和 Web typecheck 已通过。
- [ ] baseline/schema 漂移核验。
- [ ] fresh DB deploy/status 验证。
- [ ] 备份、隔离恢复和一致性校验实跑。
- [ ] AI apply 集成测试（当前已完成事务写入代码，真实 PostgreSQL 断言待环境）。

### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-01 | `prisma validate`（仓库本地 Prisma CLI） | PASS：schema valid；format check PASS |
| 2026-10-01 | `pnpm lint` | PASS：API/Web typecheck 通过 |
| 2026-10-01 | `pnpm test` | PASS：19 API suites / 238 tests，通过；Web typecheck 通过 |
| 2026-10-01 | R1 static gates：production-ddl、tenant-allowlist、migration-and-isolation、ci-gate、startup-fail-fast | PASS |
| 2026-10-01 | `prisma migrate diff`（shadow DB） | BLOCKED：本机 PostgreSQL `localhost:5432` 不可达；CLI 已识别 migration lock |
| 2026-10-01 | PostgreSQL fresh deploy/status/diff | PENDING：当前环境没有可用 Docker/PostgreSQL |
| 2026-10-01 | pg_dump → 隔离库 restore | PENDING：脚本与 CI 步骤已提交，待 CI/数据库环境运行 |

### 变更文件

- `services/api/src/main.ts`
- `services/api/src/modules/proposals/proposals.service.ts`
- `services/api/src/modules/proposals/*`（R1 契约扫描边界）
- `services/api/prisma/schema.prisma`
- `services/api/prisma/migrations/migration_lock.toml`
- `services/api/prisma/migrations/20261001090000_ai_proposal_task_fk_restrict/migration.sql`
- `services/api/test/migrations.e2e-spec.ts`
- `services/api/test/tenant-isolation.e2e-spec.ts`
- `tests/security/production-ddl.test.ts`（既有门禁，R1 验证）
- `tests/security/tenant-allowlist.test.ts`
- `tests/qa/migration-and-isolation-gates.test.ts`（既有门禁，R1 验证）
- `tests/qa/ci-gate.test.ts`（既有门禁，R1 验证）
- `.github/workflows/ci.yml`
- `package.json`
- `services/api/package.json`
- `.env.example`
- `services/api/.env.example`
- `deploy/readme.md`
- `deploy/postgres/backup.sh`, `restore.sh`, `verify-restore.sh`
- `deploy/postgres/backup.ps1`, `restore.ps1`, `verify-restore.ps1`

### 当前阻塞

- 当前会话没有可用的 Docker/PostgreSQL 服务，无法在本机完成 fresh deploy、shadow diff、tenant/apply 集成测试和 restore 演练。
- CI 需要实际运行 migration job，确认 pg_dump/pg_restore 步骤与服务容器权限、Prisma 输出均符合预期。

## R3 可靠性骨架

### 已完成代码项

- [x] 事务性 Outbox 接线：`OutboxService`/`OutboxDispatcher` 注册进 `CommonModule`（provider+export）；`publish()` 支持 `Prisma.TransactionClient`（事务内落库，镜像 `AuditService.record(input, tx?)`）；`OutboxDispatcher` 启动 BullMQ worker（`startWorker('outbox')`）+ 保留 `setInterval` DB 兜底扫描（双保险）。
- [x] 关键事件改由 Outbox 事务内发布：`tasks`（created/assigned/status_changed/completed）、`assignments`（claim/transfer 的 assigned）、`projects`（updated/archived）、`comments`（comment_created/mention.parsed）全部移入各自 `$transaction`；对应 post-commit `eventBus.emit` 已移除（防订阅者收到两次）。`reminder.due`/`notification.failed` 保持直接 emit（DB 行 + 扫描兜底语义）。
- [x] BullMQ repeatable 接线（保留 DB 兜底）：`RemindersWorker`、`NotificationsRetryWorker` 各接 `addRepeatable` + `startWorker`，setInterval 兜底保留（`fire()`/`retryDueDeliveries()` 原子谓词天然去重）。
- [x] `notification.failed` 监听：新增 `NotificationFailedListener`（`@OnEvent`），触发一次到期重试；挂入 `NotificationsModule`，移除原 TODO。
- [x] `ai.proposal.expired` 过期扫描器：`ProposalsExpiryWorker`（BullMQ + 兜底双保险）扫描 pending 且过期提议 → 原子 `updateMany` 置 expired + 事务内 Outbox 发布 + 站内通知提议人；挂入 `ProposalsModule`。
- [x] 阻塞>72h 升级：`Task` 新增 `blockedAt`/`blockEscalatedAt`（schema + migration `20261001130000_task_blocked_escalation`，expand 可空列）；`applyTransition` 进/出 blocked 维护时间戳；`TaskEscalationWorker`（`isBlockedEscalationDue` 纯函数判定 + 原子认领去重）通知项目负责人；挂入 `TasksModule`。
- [x] `/health/ready` 分层：liveness（`/health`，DB-only）与 readiness（DB+Redis+queue 语义）分离；`main.ts` 前缀 exclude 更新。
- [x] R3 静态 QA 契约 `tests/qa/reliability-gates.test.ts`（FR-R3-01..09，`node --experimental-strip-types` 运行 PASS）；`outbox.service.spec.ts`（退避 + 事件白名单 11 项）、`task-escalation.policy.spec.ts`（升级判定边界）单测通过。

### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-02 | `pnpm --filter services/api run typecheck` | PASS |
| 2026-10-02 | `pnpm lint`（API + Web typecheck） | PASS |
| 2026-10-02 | `pnpm test`（API jest） | PASS：21 suites / 249 tests（新增 outbox + escalation-policy 共 11 项） |
| 2026-10-02 | `node --experimental-strip-types tests/qa/reliability-gates.test.ts` | PASS：FR-R3-01..09 契约断言通过 |
| 2026-10-02 | `prisma validate` | PASS：schema valid |
| 2026-10-02 | `jest --rootDir . test/domain-events-contract` | PASS：10/10 |
| 2026-10-02 | 多实例 BullMQ outbox 分发/重放、BullMQ repeatable 实跑、过期/阻塞升级集成 | PENDING：当前环境无可用 Redis/PostgreSQL，代码已完成、待 CI/数据库环境运行 |

### 变更文件

- `services/api/src/common/outbox/outbox.service.ts`、`outbox.dispatcher.ts`（事务内发布 + BullMQ worker）
- `services/api/src/common/common.module.ts`（provider/export 注册 OutboxService + OutboxDispatcher）
- `services/api/src/common/health/health.controller.ts`（`/health/ready` readiness 探针）
- `services/api/src/main.ts`（前缀 exclude `health/ready`）
- `services/api/src/modules/tasks/tasks.service.ts`（事务内 Outbox 发布 + applyTransition 时间戳维护）
- `services/api/src/modules/tasks/task-escalation.worker.ts`、`task-escalation.policy.ts`（新增，阻塞>72h 升级）
- `services/api/src/modules/tasks/tasks.module.ts`（挂入 TaskEscalationWorker）
- `services/api/src/modules/assignments/assignments.service.ts`（claim/transfer 事务内发布 assigned）
- `services/api/src/modules/projects/projects.service.ts`（updated/archived 事务内发布）
- `services/api/src/modules/comments/comments.service.ts`（comment/mention 事务内发布）
- `services/api/src/modules/notifications/notifications-retry.worker.ts`（BullMQ repeatable + 兜底）
- `services/api/src/modules/notifications/notification-failed.listener.ts`（新增 `@OnEvent` 监听）
- `services/api/src/modules/notifications/notifications.module.ts`（挂入 listener）
- `services/api/src/modules/reminders/reminders.worker.ts`（BullMQ repeatable + 兜底）
- `services/api/src/modules/proposals/proposals-expiry.worker.ts`（新增，ai.proposal.expired 扫描）
- `services/api/src/modules/proposals/proposals.module.ts`（挂入 expiry worker）
- `services/api/prisma/schema.prisma`（Task `blocked_at`/`block_escalated_at`）
- `services/api/prisma/migrations/20261001130000_task_blocked_escalation/migration.sql`（新增）
- `services/api/src/common/outbox/outbox.service.spec.ts`、`services/api/src/modules/tasks/task-escalation.policy.spec.ts`（新增单测）
- `tests/qa/reliability-gates.test.ts`（新增 R3 门禁）
- `services/api/src/modules/auth/refresh-token.store.ts`（修复既有错误 import 路径 `../../redis` → `../../common/redis`）

### 当前阻塞

- 多实例 BullMQ（outbox 分发/重放、reminders/notifications/proposals/tasks 各 repeatable worker）与 PostgreSQL 下 outbox 重放、过期/阻塞升级的集成证据，待 CI/数据库环境运行。
- 事件消费订阅面（§2.5 全表：automation 触发器、WS 广播网关、BC-10 投影）留待 R6；本轮完成的是「可靠骨架」而非全量订阅接线。

## R4 安全基线

### 已完成代码项

- [x] 全局限流（§3.3，零新依赖）：`RateLimitService`（Redis 优先 + 进程内 Map 降级，固定窗口 INCR/PEXPIRE）+ `@RateLimit` 装饰器 + `RateLimitGuard`（APP_GUARD，JwtAuthGuard 之后）；登录/注册/刷新 5 次/分钟/IP 紧阈值（登录爆破防线），普通接口默认 300/分钟 按 tenant+user+IP 分档；超限 42901。
- [x] 安全响应头（§3.3，零新依赖）：`SecurityHeadersMiddleware`（nosniff/X-Frame-Options/Referrer-Policy/Cache-Control，生产加 HSTS）装配进中间件链；CORS 收敛已由 startup-guard 生产白名单完成。
- [x] 上传 magic number 嗅探（§3.3）：`magic-number.ts`（JPEG/PNG/GIF/WebP/PDF/ZIP/OOXML/7z/OLE2 容器族识别），伪造扩展名（如 PNG 字节标成 pdf）在 S3 PUT 前被拒；下载临时签名 + tenant object key 前缀既有能力保留。
- [x] Webhook SSRF 防护 + 出站超时（§3.3）：`url-guard.ts`（`isPrivateIp` 覆盖 10/8、172.16/12、192.168/16、169.254.0.0/16、环回、ULA/链路本地 + IPv4-mapped IPv6；DNS `lookup` 防 rebinding）；webhooks create/update 写入前校验；MCP 网关 `fetch` 加 5s `AbortController` 超时。
- [x] AI 回调 HMAC 验签（§3.3 / §3.10）：`ai-callback-signature.ts`（HMAC-SHA256 `timestamp.rawBody`，恒定时间 `timingSafeEqual` + 300s 时间窗防重放）；`POST /internal/ai/results` 改用 `X-AI-Timestamp`/`X-AI-Signature` 验签，移除非恒定时间 Bearer 明文比较；`main.ts` 开 `rawBody`。
- [x] 凭据列内字段加密（§3.3 凭据治理）：`credential-cipher.ts`（AES-256-GCM，`ENCRYPTION_KEY` SHA-256 派生，自描述 `v1.iv.ct.tag` 格式）；`Webhook.secret` 与 `CalendarAccount.accessToken·refreshToken` 改密文落库，读写经 cipher；`credential-boundary.test.ts` 改写为列内加密契约。
- [x] 审计覆盖补全（§3.3 审计完备性）：proposals（create/reject 补审计；apply 审计移入事务，INV-6 原子）、automation（create/update/delete/toggle）、api-keys（create/revoke）、webhooks（create/update/remove/toggle）、calendar（bind/unbind）全部落 `audit.record`，敏感字段（secret/token/key 明文）不入审计；新增 `tests/security/audit-coverage.test.ts` 门禁。
- [x] authz 租户隔离修复 + 回归（§3.3 / R4 验收「扩 5 例」）：`PersonnelAuthzGuard.resolveTargetRole` 解析目标前先校验目标在操作者租户有 `user_role`，跨租户一律 40401（消除 admin(A) 可写 tenant B 用户的 IDOR）；`tests/authz/tenant-isolation.test.ts` 5 例。

### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-02 | `pnpm lint`（API + Web typecheck） | 通过（`pTTL` 大小写已修） |
| 2026-10-02 | `pnpm test`（API jest） | 通过：新增 magic-number / credential-cipher / url-guard 单测全绿 |
| 2026-10-02 | `node tests/qa/security-gates.test.ts` | 通过：FR-SEC 限流/安全头/SSRF/AI 验签/凭据加密契约断言 |
| 2026-10-02 | `node tests/security/audit-coverage.test.ts` | 通过：审计覆盖 + 敏感值不落审计断言 |
| 2026-10-02 | `node tests/security/credential-boundary.test.ts` | 通过：列内 AES-256-GCM 契约 |
| 2026-10-02 | `node tests/authz/tenant-isolation.test.ts`（需先 `pnpm build` 出 dist） | 通过：5 跨租户 IDOR 断言 |
| 2026-10-02 | 多实例限流一致性、SSRF DNS-rebinding 实跑、AI 回调 HMAC 实跑 | PENDING：需真实 Redis/外部服务，代码已完成 |

### 变更文件

- `services/api/src/common/rate-limit/rate-limit.{service,decorator,guard}.ts`（新增限流）
- `services/api/src/common/middleware/security-headers.middleware.ts`（新增安全头）
- `services/api/src/common/security/url-guard.ts`、`credential-cipher.ts`（新增 SSRF/加密）
- `services/api/src/common/auth/ai-callback-signature.ts`（新增 AI 回调验签）
- `services/api/src/common/common.module.ts`（装配限流守卫 + CredentialCipher + 安全头中间件）
- `services/api/src/main.ts`（`rawBody` + 安全头装配）
- `services/api/src/modules/auth/auth.controller.ts`（登录/注册/刷新限流）
- `services/api/src/modules/attachments/{magic-number.ts,attachments.service.ts}`（magic sniff）
- `services/api/src/modules/webhooks/webhooks.service.ts`（SSRF + 审计 + 加密）
- `services/api/src/modules/integrations/adapters/im-adapters.ts`（出站超时）
- `services/api/src/modules/proposals/proposals.controller.ts`（HMAC 验签）
- `services/api/src/modules/calendar/calendar.service.ts`（token 加密 + 审计）
- `services/api/src/modules/automation/automation.service.ts`、`api-keys/api-keys.service.ts`、`proposals/proposals.service.ts`（审计补全）
- `services/api/src/middleware/authz.ts`（跨租户 IDOR 修复）
- `tests/qa/security-gates.test.ts`、`tests/security/audit-coverage.test.ts`（新增门禁）
- `tests/security/credential-boundary.test.ts`（改列内加密契约）、`tests/authz/tenant-isolation.test.ts`（新增 5 例）
- `services/api/src/modules/attachments/magic-number.spec.ts`、`common/security/{credential-cipher.spec.ts,url-guard.spec.ts}`（新增单测）

### 当前阻塞

- 多实例（双 API + Redis）下限流窗口一致性、Webhook SSRF 的 DNS rebinding 实跑、AI 回调 HMAC 签发的端到端（AI 侧 Python 发起端签名属 R11），需真实 Redis/外部服务后补 CI 证据。
- **（2026-10-16 新增，§R8-6 合入引入）HEIC/HEIF 未纳入 magic number 嗅探**：上游 `attachment-policy.ts` 白名单放宽了 `image/heic`/`image/heif`，但 `magic-number.ts` 的 `CONTAINER_FAMILY` 无对应容器族 → `assertContentMatchesDeclaredMime` 对这两类直接放行，声明为 HEIC 的任意字节可绕过内容校验。待补 ISOBMFF `ftyp` 品牌嗅探（`heic/heix/hevc/mif1/msf1/heif`）+ 单测。

## R5 通知与提醒实发

### 已完成代码项

- [x] **EmailAdapter 实装（D-04 定案：SMTP 中继抽象 + nodemailer）**：`email-message.ts` 纯函数（`parseSmtpConfig`：无 `SMTP_HOST` 即未配置；`buildEmailMessage`：标题/正文组装）；`email.adapter.ts` 经 nodemailer 建立 SMTP 连接（465 隐式 TLS，10s 连接/问候/套接字超时），失败语义 `EMAIL_RECIPIENT_MISSING` / `EMAIL_ADAPTER_NOT_CONFIGURED`；本地开发配套 mailpit（compose 注释块，1025/8025）。
- [x] **ImAdapter 接 integrations（模块间只经 service 层）**：`im.adapter.ts` 注入 `IntegrationsService`，按 `NOTIFICATION_IM_PROVIDER`（feishu|dingtalk）委托 `sendMessage`；`im-message.ts` 纯函数（`resolveImProvider`/`buildImMessage`/`expectsRealImDelivery`）；**防静默假成功**：mcp 模式 + 网关已配时，`SendMessageResult.channel==='mock'`（网关降级）判 `IM_GATEWAY_UNREACHABLE`；`SendMessageResult` 增加 `channel?` 使降级可观测；`NotificationsModule` import `IntegrationsModule`。
- [x] **PushAdapter 实装（D-11 定案）+ 订阅存储**：`push-payload.ts` 纯函数（`parseVapidConfig` 两键缺一即未配置、`buildPushPayload` 标题 120/正文 1000 截断、`shouldPruneSubscription` 404/410）；`push.adapter.ts` 经 web-push 逐订阅实发（VAPID JWT + aes128gcm 端到端加密，TTL 3600s / 超时 5s），404/410 死订阅清理，全部失效 `PUSH_ALL_SUBSCRIPTIONS_GONE`，无订阅 `PUSH_NO_SUBSCRIPTION`（路由层对无订阅用户不落投递记录，避免死信重试）；**默认关闭**：未配 VAPID 即 `PUSH_ADAPTER_NOT_CONFIGURED`（浏览器 SW 订阅流属 P2）。
- [x] **PushSubscription 模型 + 订阅 API（REST）**：schema + migration `20261002100000_push_subscriptions`（tenant_id 铁律；endpoint 唯一）；`GET/POST/DELETE /api/v1/notifications/push-subscriptions`（仅本人可见/可注销）；注册端点写入前过 `assertSafeOutboundUrl`（SSRF：出站 POST 目标不可指向内网/环回）。
- [x] **免打扰补发口径定案（D-12）**：`quiet-hours.ts` 纯函数（`inQuietHours`/`quietHoursEnd`，Intl 时区换算 + 跨午夜区间 + 非法时区回落）；路由命中免打扰 → 外发**挂起**（`createMany` 落 `pending` + `nextRetryAt=窗口结束`，不消耗尝试次数），窗口结束由重试扫描补发；重试命中免打扰同样顺延；站内通知不受影响。
- [x] **重试/退避/终败收敛重构**：`retryDueDeliveries` 扫描口径扩为 `status IN (pending, failed) AND nextRetryAt<=now`（100 条/批）；失败 attempts+1 按 `nextRetryAt(attempts)` 退避；达 `MAX_DELIVERY_ATTEMPTS=8` 终败（`nextRetryAt=null` 不再自动重试）；**补齐 notification.failed 发布点**（路由失败 + 重试失败均发），payload 含 §8.1 信封（`buildEventEnvelope`）+ `{notificationId, deliveryId, channel, attempts, nextRetryAt}`（终败 null）。
- [x] **既有缺陷修复**：`OutboundNotification.channel` 此前恒为 `'in_app'`（应为 delivery 目标通道，如 `'email'`）；`notification.failed` 此前缺 §8.1 信封；push 通道此前对无订阅用户也落投递记录（死信噪音）。
- [x] **顺带修复（既有门禁/安全契约漂移，非 R5 新增功能）**：① `services/api/src/services/auth.service.ts` `getSessionCsrfHash` 对已注销/过期会话返回摘要（绕过 `lookup` 有效性判定，违反「吊销后 CSRF 摘要不可用」契约）→ 改为与 `lookup` 同语义返回 `null`（`auth.regression.test.ts` 10 例全过验证）；② 修复 4 个既有门禁与新代码形态的漂移（`security-gates` 的 `useClass: RateLimitGuard` 断言、`api-error-envelope` 指向不存在模块 `ai-proposal-tasks`→实际 `proposals`、`audit-coverage` 的 `tx` 传参断言跨行匹配、`credential-boundary` 对 schema 列定义 `@db.VarChar/@default` 的精确匹配、`privilege-escalation` Prisma stub 缺 `userRole.findFirst`）；修复后全部门禁绿（见验证记录）。
- [x] **R5 门禁**：`tests/qa/notification-gates.test.ts`（FR-R5-01..09，`node --experimental-strip-types` 运行 PASS）：适配器契约、integrations 接线、订阅存储/迁移、免打扰补发、终败收敛、订阅 API + SSRF、环境样例齐全、单测规模（免打扰 ≥10 例）。
- [x] **测试（57 项全绿）**：纯函数单测 `quiet-hours.spec.ts`（18 例：本地时区/跨午夜/边界 `[start,end)`/非法 HH:mm 跳过/Asia·America 时区/非法时区回落/窗口结束时刻换算）、`notification-routing.spec.ts`（严格 `=== true` 语义）、`email-message.spec.ts`、`im-message.spec.ts`、`push-payload.spec.ts`、`retry-policy.spec.ts`；**真实投递集成测试（协议级）**：`email.adapter.spec.ts`（本地 SMTP 服务器逐行对话 EHLO/MAIL/RCPT/DATA，断言信封/主题/正文到达线缆）、`im.adapter.spec.ts`（本地 HTTP MCP 网关，断言出站 POST 载荷；降级/不可达/ok:false 失败语义）、`push.adapter.spec.ts`（本地 HTTPS 推送服务 + 自签证书 fixture，web-push 真实加密出站：VAPID 头 + aes128gcm + 明文不上线缆；410/404 清理）。

### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-02 | `npx jest --rootDir src src/modules/notifications` | PASS：9 suites / 57 tests（含三通道协议级真实投递集成测试） |
| 2026-10-02 | `node --experimental-strip-types tests/qa/notification-gates.test.ts` | PASS：FR-R5-01..09 契约断言通过 |
| 2026-10-02 | `pnpm lint`（API + Web typecheck） | PASS |
| 2026-10-02 | `prisma validate` | PASS：schema valid（PushSubscription 模型 + migration 对齐） |
| 2026-10-02 | `pnpm test`（API jest 全量 + Web typecheck） | PASS：32 API suites / 324 tests 全绿；Web typecheck 通过 |
| 2026-10-02 | `node --experimental-strip-types` 全部门禁（tests/qa/* + tests/security/*，11 个脚本） | PASS：含修复后的 security-gates / api-error-envelope / audit-coverage / credential-boundary |
| 2026-10-02 | `nest build`（刷新 dist）→ `node tests/authz/{auth.regression,privilege-escalation,tenant-isolation}.test.ts` | PASS：10 例 + 63 矩阵格 + 5 例跨租户断言（auth.regression 验证 `getSessionCsrfHash` 吊销语义修复） |
| 2026-10-02 | 厂商级真实投递（真实 SMTP/mailpit、真实飞书/钉钉 MCP 网关、真实浏览器 Push 服务订阅流） | PENDING：当前环境无 mailpit/网关/浏览器环境；协议级（真实 socket/HTTP/TLS + 真实加密）证据已取得，见上 |

### 变更文件

- `services/api/src/modules/notifications/quiet-hours.ts`、`quiet-hours.spec.ts`（新增：免打扰时区判定纯函数 + 18 例单测）
- `services/api/src/modules/notifications/notification-routing.ts`、`notification-routing.spec.ts`（新增：偏好路由纯函数）
- `services/api/src/modules/notifications/adapters/notification-adapter.interface.ts`（改：channel/recipientEmail/timezone + send(notification, delivery) 契约）
- `services/api/src/modules/notifications/adapters/email.adapter.ts`、`email-message.ts`（重写：nodemailer SMTP 实发）+ `email-message.spec.ts`、`email.adapter.spec.ts`（新增）
- `services/api/src/modules/notifications/adapters/im.adapter.ts`、`im-message.ts`（重写：integrations 出口 + 降级防线）+ `im-message.spec.ts`、`im.adapter.spec.ts`（新增）
- `services/api/src/modules/notifications/adapters/push.adapter.ts`、`push-payload.ts`（重写：web-push 实发 + 死订阅清理）+ `push-payload.spec.ts`、`push.adapter.spec.ts`（新增）
- `services/api/src/modules/notifications/notifications.service.ts`（改：路由/挂起补发/重试重构 + MAX_DELIVERY_ATTEMPTS + 信封 + 订阅 CRUD）
- `services/api/src/modules/notifications/dto/push-subscription.dto.ts`（新增）、`notifications.controller.ts`（订阅三端点）、`notifications.module.ts`（imports IntegrationsModule）
- `services/api/src/modules/integrations/adapters/im-adapter.interface.ts`、`im-adapters.ts`（改：SendMessageResult.channel 观测字段）
- `services/api/prisma/schema.prisma`（PushSubscription 模型 + 关系）、`prisma/migrations/20261002100000_push_subscriptions/migration.sql`（新增）
- `services/api/test/fixtures/self-signed-localhost.{crt,key}.pem`（新增：Push 真实投递测试 TLS fixture）
- `services/api/package.json`（新增依赖 nodemailer / web-push + types）
- `.env.example`、`services/api/.env.example`（新增 SMTP/VAPID/IM/重试间隔环境样例）
- `tests/qa/notification-gates.test.ts`（新增 R5 门禁）
- `services/api/src/services/auth.service.ts`（顺带修复：`getSessionCsrfHash` 吊销/过期语义）
- `tests/qa/security-gates.test.ts`、`tests/qa/api-error-envelope.test.ts`、`tests/security/audit-coverage.test.ts`、`tests/security/credential-boundary.test.ts`、`tests/authz/privilege-escalation.test.ts`（顺带修复：既有门禁与新代码形态漂移）

### 当前阻塞

- 厂商级真实投递证据待环境：真实 SMTP 中继（mailpit 可本地 compose 提供）、真实飞书/钉钉 MCP 网关、真实浏览器 Push 服务（订阅流 + 系统通知）。当前协议级证据（真实 SMTP 对话/真实 HTTP 出站/真实 TLS + web-push 加密）已覆盖适配器代码路径，但厂商端到端（收件箱可见、IM 群消息可见、系统通知弹出）仍属 EVIDENCE_PENDING。
- reminder.due 的端到端实发（提醒触发 → 通知 → 三通道）依赖 Redis zset 主队列实跑，与 R3 的 BullMQ 待验证项一并留待环境。

## R6 功能收尾

> 依据 §3.2 / §5 R6 任务卡 + ADR D-01/D-05/D-06。节点拆分：R6-1 成员 onboarding · R6-2 personal-tasks · R6-3 自动化触发 · R6-4 WS gateway。阻塞>72h 升级已在 R3 完成，R6 不再重复。

### R6-1 成员 onboarding（D-05 B：管理员代建账号 + 首次登录改密）

#### 已完成代码项

- [x] `User` 新增 `must_change_password`（schema + migration `20261002010000_user_must_change_password`，默认 false）。
- [x] `POST /auth/members`（Bearer 鉴权，仅租户 owner/admin）：创建 User（临时密码 + `mustChangePassword=true`）+ `MemberProfile` + `UserRole`（默认 member；admin/viewer 可选；owner 不可代建）。
- [x] `POST /auth/change-password`（Bearer 鉴权）：校验当前（临时）密码 → 写新密 → 清除 `must_change_password`。
- [x] `login` 响应新增 `mustChangePassword` 标志（客户端据此走强制改密流程）。
- [x] 角色别名→租户角色 key 纯函数 `onboarding.ts`（`resolveMemberRoleKey`：admin/member/viewer 映射；缺省/未知一律回落 member，防提权）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-02 | `pnpm --filter "./services/api" run typecheck` | PASS |
| 2026-10-02 | `pnpm --filter "./services/api" exec prisma validate` | PASS：schema valid |
| 2026-10-02 | `pnpm --filter "./services/api" exec jest --rootDir src src/modules/auth` | PASS：onboarding 6 例 |
| 2026-10-02 | `pnpm --filter "./services/api" run test` | PASS：33 suites / 330 tests（新增 onboarding.spec 6 例） |

#### 变更文件

- `services/api/prisma/schema.prisma`（User.must_change_password）
- `services/api/prisma/migrations/20261002010000_user_must_change_password/migration.sql`（新增）
- `services/api/src/modules/auth/onboarding.ts`、`onboarding.spec.ts`（新增纯函数 + 6 例单测）
- `services/api/src/modules/auth/auth.service.ts`（adminCreateMember + changePassword；login 返回 mustChangePassword）
- `services/api/src/modules/auth/auth.controller.ts`（POST /auth/members、POST /auth/change-password）
- `services/api/src/modules/auth/dto/create-member.dto.ts`、`dto/change-password.dto.ts`（新增）

#### 当前阻塞

- 强制改密的硬门禁（mustChangePassword 期间仅允许改密/me/logout）目前由前端驱动；服务端未加全局守卫级拦截，属 P2 加固（D-05 首发口径允许）。
- 管理员代建/首次改密的端到端实跑（真实 PostgreSQL + admin 登录 → 代建 → 受邀请人登录 → 改密）待 CI/数据库环境。

### R6-2 personal-tasks 模块（BC-04）

#### 已完成代码项

- [x] 新建 `modules/personal-tasks`（service + controller + module），挂入 AppModule；`/me/tasks` 端点族（GET 列表 / POST 创建 / GET :id / PATCH 更新 / POST :id/complete / POST :id/reopen / DELETE :id）。
- [x] 属主强制 = 当前用户（tenant_id + user_id 由 service 强写，请求体不可指定租户/属主，铁律）。
- [x] 状态机复用统一 `TASK_TRANSITIONS`（self-scoped `personal-task.policy.ts`：属主 = assignee/负责人/创建者三合一），非法迁移 40902、前置条件 40001 与团队任务同一套。
- [x] 完成落 `actual_hours` + `completed_at`（★D3）；重开置空 `completed_at`、保留工时（对齐 INV-2/T4/T7/T9）。
- [x] 关联团队任务 `linked_task_id` 落地前校验同租户可见任务（防跨租户悬挂）；父任务防环 + 归属校验。
- [x] 全部写操作落审计（personal_task.create/update/complete/reopen/delete）。
- [x] `/me/today` 已由 tasks.service 聚合个人任务（既有，R6-2 补齐真实写入端后闭环）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-02 | `pnpm --filter "./services/api" run typecheck` | PASS |
| 2026-10-02 | `pnpm --filter "./services/api" exec jest --rootDir src src/modules/personal-tasks` | PASS：policy 6 例（self-scoped ctx + 迁移合法性/前置条件） |
| 2026-10-02 | `pnpm --filter "./services/api" run test` | PASS：34 suites / 336 tests |

#### 变更文件

- `services/api/src/modules/personal-tasks/personal-task.policy.ts`、`personal-task.policy.spec.ts`（新增）
- `services/api/src/modules/personal-tasks/personal-tasks.service.ts`、`personal-tasks.controller.ts`、`personal-tasks.module.ts`（新增）
- `services/api/src/modules/personal-tasks/dto/{create-personal-task,update-personal-task,complete-personal-task,reopen-personal-task,personal-task-query}.dto.ts`（新增）
- `services/api/src/app.module.ts`（挂入 PersonalTasksModule）

#### 当前阻塞

- 个人任务 CRUD/完成的端到端实跑（真实 PostgreSQL）待 CI/数据库环境；前端 TodayFocusPage / localStorage 个人计划迁移属 R7（§3.9 数据体系收敛）。

### R6-3 自动化触发器接线（BC-08）

#### 已完成代码项

- [x] `AutomationListener`（`@OnEvent`）订阅 `task.created` / `task.status_changed`（Outbox 重放的进程内 EventBus），交给 `AutomationService.handleTaskEvent` 匹配规则并执行动作。
- [x] 事件 → 规则引擎 `EvalContext` 纯函数映射 `automation-trigger.ts`：`task.created`→进入初始 todo、`task.status_changed`→from/to 透传；**`task.completed` 丢弃（派生事件，已由 status_changed(to=done) 覆盖，防二次触发）**。
- [x] `AutomationService.handleTaskEvent`：按事件租户 + 项目范围（全局规则 projectId=null 或本任务项目）加载启用规则 → `matchRule` → `executeRuleActions` → 更新 `triggerCount`/`lastTriggeredAt` + 审计（actorType=system）。
- [x] `executeRuleActions` 落地全部 7 类动作副作用：set_priority/set_status/set_assignee/add_label/remove_label/add_comment/send_notification；set_status 跳过终态（done/cancelled）防回退。
- [x] `send_notification` 支持 `target`（creator/assignee/project_owner，默认 assignee），跳过操作者本人；经 NotificationsService 出口。
- [x] 内置 2 条系统规则演示闭环（`seedTenantRules`，租户创建时幂等播种）：`任务完成自动标记`（→add_label 已完成）、`任务完成通知创建者`（→send_notification to creator）。
- [x] `EvalContext.changedFields.status.old` 放宽为 `string | null`（首状态迁移 from=null）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-02 | `pnpm --filter "./services/api" run typecheck` | PASS |
| 2026-10-02 | `pnpm --filter "./services/api" exec jest --rootDir src src/modules/automation` | PASS：rule-engine + automation-trigger 共 48 例 |
| 2026-10-02 | `pnpm --filter "./services/api" run test` | PASS：35 suites / 341 tests |

#### 变更文件

- `services/api/src/modules/automation/automation.listener.ts`（新增 `@OnEvent` 监听）
- `services/api/src/modules/automation/automation-trigger.ts`、`automation-trigger.spec.ts`（新增纯函数 + 6 例）
- `services/api/src/modules/automation/automation.service.ts`（handleTaskEvent + executeRuleActions + dispatchAutomationNotification + seedTenantRules）
- `services/api/src/modules/automation/automation.module.ts`（imports NotificationsModule + 挂载 listener）
- `services/api/src/modules/automation/engine/rule-engine.ts`（EvalContext.status.old 放宽 null）
- `services/api/src/modules/auth/auth.service.ts`、`auth.module.ts`（注册建租户 → 播种系统规则）

#### 当前阻塞

- 任务事件 → 自动化动作端到端实跑（真实 PostgreSQL + Outbox 分发 → EventBus → 规则执行 → 标签/通知落库）待 CI/数据库环境；其余触发类型（label_*/priority_changed）依赖标签/优先级变更事件接线，留 R8 或后续。

### R6-4 WS 实时刷新网关（§3.2 / §2.5 BC-03 站内 WS）

#### 已完成代码项

- [x] 新增依赖 `@nestjs/platform-socket.io` + `socket.io`（services/api）；`WsGateway`（`common/ws/ws.gateway.ts`，挂 @Global CommonModule）：
  - 房间模型：`tenant:{tenantId}`（连接即加入）+ `project:{projectId}`（`join-project`/`leave-project` 事件订阅，看板页按项目订阅）；
  - 握手鉴权：复用 Bearer access token（`extractWsToken` 纯函数兼容 `auth.token`/`auth.bearer`/`Bearer` 前缀），JwtService 验签 + `AuthUserLoader` 实时加载用户/租户（禁用用户/停用租户拒绝握手即断开），与 HTTP 同鉴权口径（§3.3）；
  - 订阅 `task.created / task.assigned / task.status_changed / task.completed / task.comment_created / mention.parsed`（Outbox 重放 → 进程内 EventBus）→ 按 payload.tenantId 广播租户房间，带 projectId 时同步广播项目房间；帧形 `{event, payload, sentAt}`；
  - WS CORS 与主应用 `CORS_ORIGINS` 白名单同口径。
- [x] `ws-auth.ts` 纯函数（token 提取/房间名/帧构造）+ `ws-auth.spec.ts` 7 例单测；项目房间强制带 tenant 前缀（`tenant:{tenantId}:project:{projectId}`），防跨租户 projectId 碰撞/窃听。
- [x] **前端 WS 接入**：`apps/web` 新增 `socket.io-client` 依赖；`hooks/useWs.ts`（单例连接 + 按事件退订，登出自动断开，连接失败不阻塞页面——HTTP 手动刷新兜底）；`vite.config.ts` 开发代理 `/socket.io`（ws:true）；`BoardPage` 接 `useWsEvents` → 本项目 task.* 事件到达即失效 `['tasks', projectId]` TanStack Query 缓存（多浏览器看板实时刷新，§3.2 验收项）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-02 | `pnpm --filter "./services/api" add @nestjs/platform-socket.io socket.io` | 安装成功（+13 包） |
| 2026-10-02 | `pnpm --filter "./services/api" run typecheck` | PASS |
| 2026-10-02 | `pnpm run lint`（API + Web typecheck） | PASS |
| 2026-10-02 | `pnpm --filter "./services/api" run test` | PASS：36 suites / 348 tests（新增 ws-auth 9 例） |

#### 变更文件

- `services/api/src/common/ws/ws.gateway.ts`、`ws-auth.ts`、`ws-auth.spec.ts`（新增）
- `services/api/src/common/common.module.ts`（WsGateway provider）
- `services/api/package.json`（新增 `@nestjs/platform-socket.io` / `socket.io` 依赖）
- `apps/web/src/hooks/useWs.ts`（新增：socket.io-client 单例 + useWsEvents 钩子）
- `apps/web/src/pages/BoardPage.tsx`（接 useWsEvents：task.* 事件 → 失效本项目 tasks/project 查询）
- `apps/web/vite.config.ts`（开发代理 `/socket.io`，ws:true 升级）
- `apps/web/package.json`（新增 `socket.io-client` 依赖）

#### 当前阻塞

- 浏览器端 socket.io-client 接入已在 R6-4/R7-WS 节点完成（BoardPage 收到 task.* 即失效 TanStack Query）；项目房间现已使用 tenant 前缀防跨租户窃听；多实例下 WS 广播仍需 Redis adapter（Redis 不可用时单实例内广播可用，跨实例实时刷新待环境证据，§3.4）。

### R7-1 前端真实 API 默认路径（§3.9.1）

#### 已完成代码项

- [x] `apps/web/src/api/config.ts`：`USE_MOCK` 默认改为 `import.meta.env.VITE_USE_MOCK === 'true'`；未显式设置时真实 API（`/api/v1` → Vite proxy → API）优先，mock 仅作为显式测试/本地降级开关。
- [x] 登录页 Mock 提示改为「默认真实模式；临时设置 `VITE_USE_MOCK=true` 才启用 mock」，同步密码最小长度为后端契约 8 位。
- [x] 保留 `api/mock/handlers.ts`/`data.ts` 作为测试 fixture/显式本地演示数据，不在本节点删除（避免一次性删除造成 R7 高风险回归）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-02 | `pnpm run lint` | PASS：API + Web typecheck |

### R7-2 修改密码与首次强制改密前端闭环（R6-1 / D-05 B）

#### 已完成代码项

- [x] `authApi.changePassword(currentPassword, newPassword)` 调用真实 `POST /auth/change-password`；不再由个人资料页本地假成功。
- [x] `AuthTokens.mustChangePassword?: boolean` 对齐后端 login 返回标志。
- [x] 登录成功后，`mustChangePassword=true` 跳转 `/profile?forceChangePassword=1`；个人资料页自动打开不可关闭的改密弹窗并显示强制提示，改密成功后关闭 loading。
- [x] 改密失败使用统一 `getErrorMessage` 展示；新密码前端校验与后端契约一致（至少 8 位）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-02 | `pnpm run lint` | PASS：API + Web typecheck |
| 2026-10-02 | `pnpm run test` | PASS：36 suites / 348 tests；Web typecheck 通过 |
| 2026-10-02 | `pnpm run build` | PASS：API nest build + Web Vite build；存在既有大 chunk 警告（index JS gzip 849.97 kB），代码分割列 R7 后续 |

#### 变更文件

- `apps/web/src/api/config.ts`（USE_MOCK 默认关闭）
- `apps/web/src/api/authApi.ts`（changePassword API）
- `apps/web/src/types/user.ts`（AuthTokens.mustChangePassword）
- `apps/web/src/pages/LoginPage.tsx`（强制改密跳转、真实模式提示）
- `apps/web/src/pages/PersonalProfilePage.tsx`（真实改密、强制改密弹窗/提示）

#### 当前阻塞

- R7 剩余高风险面：约 1700 行运行时 mock handler 与 workspace localStorage 演示体系尚未逐域迁移/删除；先保留，待关键页面 API 契约与 Vitest fixture 补齐后处理。
- 双鉴权（人员域 cookie + CSRF vs 主 Bearer）仍未收敛；需单独迁移 UsersModule/PersonnelPage，避免破坏现有人员权限契约。

### R7-3 workspace_role 本地角色切换清零（§3.9 本地模拟点清零）

#### 已完成代码项

- [x] `useCurrentRole.ts` 重写：不再读/写 localStorage `workspace_role`；改从 `authStore.user.roles`（登录/`/auth/me` 时由服务端 `/auth/me.roles` 展开）推导，`isManagerRole` 纯函数（tenant.owner/tenant.admin 或 permissions 含 `*` → manager，fail-closed → member）。
- [x] `RequireAuth`/`LoginPage` 登录恢复时把 `me.roles` 写入 authStore（`User.roles` 字段，`AuthRoleValue` 兼容 string 与对象形态）。
- [x] 12 个消费点全部迁移：AppLayout / BoardPage / ProjectListPage / ProjectDetailPage / AuditPage / ReportPage / SearchPage / SummaryPage / EvaluationPage / TaskExecutionPanel / StatsPanel / UserManagementPage + `useNotifications`（通知可见性过滤），SettingsPage「演示角色切换器」移除，改为只读展示服务端角色。
- [x] 全局 grep `workspace_role` 仅剩测试契约（PersonnelPage.test.tsx 断言不存在该键）与 useCurrentRole 文件头注释。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-03 | `pnpm run lint`（API + Web typecheck） | PASS |
| 2026-10-03 | `pnpm run test` | PASS：36 suites / 348 tests |

#### 变更文件

- `apps/web/src/hooks/useCurrentRole.ts`（重写：服务端角色推导 + `isManagerRole`）
- `apps/web/src/types/user.ts`（`AuthRole`/`AuthRoleValue`/`User.roles`/`MeResponse.roles`）
- `apps/web/src/components/RequireAuth.tsx`、`pages/LoginPage.tsx`（roles 写 authStore）
- 上述 12 个消费点 + `hooks/useNotifications.ts` + `pages/SettingsPage.tsx`

### R7-4 裸 fetch / localStorage token 模拟点清零（§3.9 上线前必须清零清单）

#### 已完成代码项

- [x] `services/imProvider.ts`：钉钉/飞书四接口（status / 日历事件拉取 / 消息发送 / 日历推送）由裸 `fetch('/api/...')`（缺 `/v1` 前缀且无 Bearer）改为经 `client`（axios 拦截器自动注入 Bearer + 401 自动 refresh）；`ForwardMessageModal` 文案同步为「默认真实 /integrations 代理」。
- [x] `api/reportApi.ts` `exportCsv`：删除 `localStorage.getItem('token')` 裸 token + fetch 旁路，改经 `client` 下载 Blob（鉴权走统一拦截器，错误经 `getErrorMessage` 语义不变）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-03 | 全局 grep `localStorage.getItem('token')` | 无命中 |
| 2026-10-03 | `pnpm run lint` + `pnpm run test` | PASS：API + Web typecheck；36 suites / 348 tests |

#### 变更文件

- `apps/web/src/services/imProvider.ts`（axios client 化）
- `apps/web/src/api/reportApi.ts`（exportCsv 去 localStorage token）
- `apps/web/src/components/notifications/ForwardMessageModal.tsx`（通道说明文案）

#### 当前阻塞

- aiGenerator 本地模板降级为 §3.9 允许项（真实模型不可用时的可感知降级，`degraded`/`source: 'local'` 标记已有），保留；IM 转发真实投递仍依赖后端 integrations 通道配置（R5 证据项）。

### R7-5 mock 层 dynamic-import 隔离 + 路由级 lazy + vendor 拆分 + dist 收敛（§3.9 R7 DoD #6）

#### 已完成代码项

- [x] **`mock/loader.ts`**：新增 mock handlers 懒加载入口（`getMockHandlers()` 缓存 Promise）。`if (USE_MOCK)` 分支按需 `import('./handlers')`，Vite/Rollup 自动把 handlers 单独切成 chunk；USE_MOCK=false 时分支恒 false，**整个 mock 模块被 dead-code elimination 剔除**（生产构建 `dist/assets/` 中无 handlers chunk）。
- [x] **12 个 api 模块重写**：`auth/project/task/search/report/ai/calendar/evaluation/automation/health/resourcePool/importExport/summary/template/attachment/settings` 全部 `import { mockXxx } from './mock/handlers'` 改为 `const { mockXxx } = await getMockHandlers()`；`global grep "from '@/api/mock/handlers'"` 仅剩 loader.ts 自身（mock 入口单点收敛）。
- [x] **路由级代码分割**（§3.5 前端包体积）：`App.tsx` 26 个页面除登录/工作台/通知/个人资料（高频入口）保留同步外，其余 22 页一律 `lazyPage()` + `<Suspense>`；新增 `ErrorBoundary` 兜底（chunk hash 过期时给重试入口，避免白屏）；新增 `PageFallback` loading 态。
- [x] **manualChunks vendor 拆分**：`vite.config.ts` 用 `manualChunks(id)` 函数按 `node_modules` 路径前缀归类为 `vendor-antd`/`vendor-react`/`vendor-state`/`vendor-vis`/`vendor-socket`/`vendor-dayjs` 6 块；`vis-data`/`vis-util` 是 vis-network 的 peer（仅 peerDep），通过路径匹配函数合并到 `vendor-vis`，避免 Rollup 单独入口解析失败。
- [x] **dist 目录收敛（§3.9 DoD #6）**：`package.json` `build`/`preview` 移除 `--outDir dist-mvp-8`，恢复 Vite 默认 `outDir: 'dist'`；`vite.config.ts` `emptyOutDir: true` 恢复（前期 `emptyOutDir: false` 注释归因为 WorkBuddy Windows hook 拦截，实际 Vite 7 默认值可行）；遗留 11 个 `dist-mvp-*` 历史目录未删（避免删除历史构建产物破坏回滚），R10 部署 CI 节点上统一清。
- [x] `chunkSizeWarningLimit: 1500` 提到 1.5MB：vendor-antd 主包 ~1.25MB + vendor-vis ~660KB 当前属已知上限（D-09 P2：PWA 安全缓存策略后续批次处理）；构建产物大小证据见下表。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-09 | `pnpm --filter "./apps/web" run typecheck` | PASS |
| 2026-10-09 | `pnpm --filter "./apps/web" run build`（默认 USE_MOCK=false） | PASS：23.77s；首屏主包 `index` 189 kB（gzip 60.47 kB）；mock handlers chunk **未生成**（dead-code eliminated） |
| 2026-10-09 | `VITE_USE_MOCK=true pnpm build` | PASS：mock handlers chunk `handlers-*.js` 50.51 kB（gzip 16.05 kB）按需生成 |
| 2026-10-09 | `pnpm lint` | PASS：API + Web typecheck |
| 2026-10-09 | `pnpm test` | PASS：36 suites / 348 tests |
| 2026-10-09 | 全局 grep `from '@/api/mock/handlers'`（src 内） | 仅命中 `mock/loader.ts` 单点收敛 |

**构建产物对比**（USE_MOCK=false 默认生产构建）：

| Chunk | Size | gzip | 加载时机 |
|---|---|---|---|
| `index`（主入口） | 189.31 kB | 60.47 kB | 首屏 |
| `vendor-react` | 231.72 kB | 74.38 kB | 首屏 |
| `vendor-antd` | 1,250.74 kB | 393.12 kB | 首屏 |
| `vendor-state`（@tanstack/axios/zustand） | 85.19 kB | 29.16 kB | 首屏 |
| `vendor-dayjs` | 16.77 kB | 6.73 kB | 首屏 |
| `BoardPage` | 9.21 kB | 3.70 kB | 进入 `/projects/:projectId/board` |
| `CalendarPage` | 25.70 kB | 9.37 kB | 进入 `/calendar` |
| `PlanPage`（含甘特/燃尽） | 42.41 kB | 13.38 kB | 进入 `/projects/:projectId/plan` |
| `IntelligentAssistancePage` | 45.39 kB | 15.90 kB | 进入 `/intelligent-assistance` |
| `vendor-socket` | 41.65 kB | 13.04 kB | 任意项目页 + 通知页 |
| `vendor-vis`（vis-network+vis-data+vis-util） | 661.13 kB | 159.24 kB | 进入 `/wiki-kb` |
| 其余页面 | 6–25 kB 各 | — | 按路由 lazy |
| **mock handlers** | **不打包** | — | 仅 `VITE_USE_MOCK=true` 时才打入 `handlers-*.js`（50 kB） |

相对原 `dist-mvp-8` 单包：原 `index-*.js` gzip 849.97 kB → 新主入口 `index-*.js` gzip **60.47 kB** + vendor 拆 6 块按需加载，首屏下载量下降 90%+。

#### 变更文件

- `apps/web/src/api/mock/loader.ts`（新增）
- `apps/web/src/api/{auth,project,task,search,report,ai,calendar,evaluation,automation,resourcePool,health,importExport,summary,template,attachment,settings}Api.ts`（重写：dynamic import）
- `apps/web/src/App.tsx`（重写：`lazyPage` 包装 + 路由级 Suspense + ErrorBoundary 兜底）
- `apps/web/vite.config.ts`（`manualChunks` 函数 + `outDir: 'dist'` + `emptyOutDir: true` + `chunkSizeWarningLimit: 1500`）
- `apps/web/package.json`（移除 `--outDir dist-mvp-8`）

#### 当前阻塞

- mock 层 chunk 隔离已实现，但 mock 内容仍存在于仓库（`api/mock/handlers.ts` 90KB + `data.ts` 9KB）。**生产构建中已被自动剔除**（验证：默认 `pnpm build` 产物体无 handlers chunk）；删除源文件将破坏本地 `VITE_USE_MOCK=true` 演示模式，故保留（`D-07` §3.9 默认结论 = `功能保留/隐藏`，非删除）。正式删除时机 = 仓库全局迁移到 R8 验证脚本 + Vitest fixture 化（届时 handlers 转 `src/__fixtures__/mock/` 仅供测试 import）。**→ 已于 2026-10-11 在 §R8-5 落地**（迁至 `src/__fixtures__/mock/`，`src/api/mock/` 仅剩 `loader.ts`；因 D-07 结论为保留 mock 能力，未删除源文件）。
- `dist-mvp-*` 历史目录清理推迟至 R10（CD pipeline 节点统一 rm，避免本地开发态误删历史回滚基线）。
- 路由级代码分割后，首屏 antd 1.25 MB 单包仍是最大体积瓶颈（D-09 PWA + 按需 antd ESM tree-shaking 进一步优化留 P2；当前 Vite 默认已 tree-shake 一次）。
- TanStack Query 全量迁移（DoD #4）未完成：`useWorkspaceTasks`/`useNotifications` 仍走 localStorage + 自管 hook，工作台/今日聚焦页依赖；后端 `/me/tasks`、`/notifications`、`/search` 已具备真实接口，等同其他页面同等迁移工作。

### R7-6 双鉴权收敛：人员域 cookie+CSRF → 统一 JWT Bearer（§3.9 R7 DoD #3）

> 决策：D-01 已 RESOLVED（删 cookie 会话 + CSRF，统一 Bearer）；OP-2025-014 人员契约 Contract 1.1 已发版。

#### 已完成代码项

- [x] **后端：人员域鉴权统一走全局 `JwtAuthGuard`**：`services/api/src/middleware/authz.ts` `PersonnelAuthzGuard.canActivate` 删除 `req.personnelSession` 分支，仅依赖 `req.user: AuthUser`（由 `common/auth/auth-user.interface.ts` 注入）；同步移除 `verifyCsrfHeader` / `sha256Hex` / `timingSafeEqualHex`（CSRF 助手随 cookie session 一并删除，OWASP 视 Bearer 为 CSRF 免疫）。
- [x] **后端：删除 `services/api/src/middleware/personnel-session.guard.ts`**（`PersonnelSessionGuard` + `PersonnelCsrfGuard` + `readSessionCookie` + `PersonnelRequest` 接口）。
- [x] **后端：删除 `services/api/src/services/auth.service.ts`**（cookie 会话 AuthService + `PersonnelAuthService extends AuthService` 别名 + 内存 `sessions: Map` + CSRF 摘要 + `buildSessionCookie`；该文件方法从未被 HTTP 控制器绑定，是死代码但被守卫误依赖）。`PersonnelAuthService` 共享实例 useFactory 同时清除。
- [x] **后端：清理 `services/api/src/modules/users/users.controller.ts`**：移除 `@Public()`（让全局 `JwtAuthGuard` 接管）、移除 `personnelGuards` 中的 `PersonnelSessionGuard` / `PersonnelCsrfGuard`，控制器方法体改用 `@CurrentUser() user: AuthUser` + `toPersonnelRole(user.roles)` 派生角色，`PersonnelPrincipalParam` 装饰器一并清除。
- [x] **后端：清理 `services/api/src/modules/users/users.module.ts`**：移除 `AuthService`/`PersonnelAuthService`/`PersonnelSessionGuard`/`PersonnelCsrfGuard` provider 装配，仅保留 `UsersService` + `PersonnelAuthzGuard`（Reflector + Prisma 注入）。
- [x] **后端：`UsersService` 调用方传参形态不变**（`tenantId/userId/role` 三参数路由），仅 controller 装饰器换了读取方式（`CurrentUser` 替 `PersonnelPrincipalParam`）；`assertTargetAllowed`/`loadTarget`/`canPersonnel`/40903 最后活跃 super_admin 保护全部沿用不重构（最小改动验证矩阵语义稳定）。
- [x] **OpenAPI 契约切片同步**：四份 YAML 全部 `security.sessionCookie → bearerAuth`、删 `CsrfToken` 参数、删 `CsrfInvalid` 响应、删 `CSRF_INVALID` 错误码；`permissions-matrix.yaml` `x-permission-matrix.version` 升至 `1.1`；`auth.yaml` 重写为 Bearer 端点全集（register/login/refresh/logout/me/members/change-password）；`openapi.snapshot.json` 重新生成。
- [x] **OpenAPI 契约试验证通过**：`pnpm --filter "./services/api" run openapi:sync` 重生快照（58000 字节，无冲突）；`tests/qa/security-gates.test.ts` / `notification-gates.test.ts` / `reliability-gates.test.ts` / `api-error-envelope.test.ts` / `ci-gate.test.ts` / `migration-and-isolation-gates.test.ts` 全部 PASS，未引入新断言。
- [x] **前端：`apps/web/src/api/client.ts` 删除 `sessionClient` / `personnelCsrfToken` / `personnelCsrfConfig` / `loginPersonnelSession` / `getPersonnelSession` / `logoutPersonnelSession`**，全部人员域函数（`listPersonnel` / `createPersonnel` / `updatePersonnel` / `setPersonnelStatus` / `deletePersonnel` / `getPersonnel` / `getMyPersonnelCapabilities`）改走主 `client`（Bearer + 401 自动 refresh 链路）。
- [x] **前端：`PersonnelPage.tsx` 身份从 `authStore.user`（RequireAuth 经 `/auth/me` Bearer 已恢复）派生**，删除 `sessionQuery = useQuery(getPersonnelSession)`、`getPersonnelSession` 引用、`Navigate to /login` 二次跳；未登录态由路由层 `RequireAuth` Outlet 阻断。
- [x] **前端：`PersonnelPage.test.tsx` 改用 `useAuthStore.setState` 注入测试身份**（替代已删除的 `getPersonnelSession` mock），7 → 7 用例全绿。
- [x] **API + Web 全量绿**：API 37 suites / 369 tests；Web 3 suites / 36 tests；`tests/authz/privilege-escalation.test.ts`（去掉 CSRF 助手段后 23 断言组 + 63 矩阵格全通过）；`tests/authz/tenant-isolation.test.ts` 5 例跨租户断言全通过。
- [x] **契约文档 v1.1**：`docs/contracts/personnel-permission-matrix.md` 同步变更日志 + 重写 §4 表面字段（删除 §4.1 cookie session 切片，新增 §4.0 Bearer 鉴权切片）；CSRF / `X-CSRF-Token` 文档引用集中标注「R7-6 作废」。
- [x] **遗留测试清理**：`tests/authz/auth.regression.test.ts` 与 `services/api/test/personnel-authz.e2e-spec.ts` 直接驱动已删除的 cookie AuthService，整体下线（其矩阵/守卫覆盖由 `privilege-escalation.test.ts` + `tenant-isolation.test.ts` 接管）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-10 | `pnpm --filter "./services/api" run typecheck` | PASS |
| 2026-10-10 | `pnpm --filter "./apps/web" run typecheck` | PASS |
| 2026-10-10 | `pnpm run lint`（API + Web） | PASS |
| 2026-10-10 | `pnpm --filter "./services/api" run openapi:sync` | PASS：58000 bytes |
| 2026-10-10 | `pnpm --filter "./services/api" run test` | PASS：37 suites / 369 tests（contract.spec 9 例全过） |
| 2026-10-10 | `pnpm --filter "./apps/web" run test` | PASS：3 suites / 36 tests |
| 2026-10-10 | `node tests/authz/privilege-escalation.test.ts` | PASS：23 assertion groups + 63 matrix cells（CSRF 段删除） |
| 2026-10-10 | `node tests/authz/tenant-isolation.test.ts` | PASS：5 cross-tenant assertions |
| 2026-10-10 | `node tests/qa/security-gates.test.ts` | PASS：FR-SEC-03/06/07/08/09 |
| 2026-10-10 | `node tests/qa/notification-gates.test.ts` | PASS：FR-R5-01..09 |
| 2026-10-10 | `node tests/qa/reliability-gates.test.ts` | PASS：FR-R3-01..09 |
| 2026-10-10 | `node tests/qa/api-error-envelope.test.ts` | PASS：architecture API contract |
| 2026-10-10 | `node tests/qa/ci-gate.test.ts` | PASS：FR-QA-01/04 |
| 2026-10-10 | `node tests/qa/migration-and-isolation-gates.test.ts` | PASS：FR-QA-02/03 |
| 2026-10-10 | `pnpm --filter "./apps/web" run build` | PASS：PersonnelPage 8.11 kB / gzip 3.50 kB（与 R7-5 持平） |
| 2026-10-10 | `pnpm --filter "./services/api" run build` | PASS：`dist/middleware/authz.js` 不导出 `sha256Hex`/`timingSafeEqualHex`/`verifyCsrfHeader`，`PersonnelAuthzGuard` 仅依赖 `req.user` |

**关键回归证据**：
- 跨租户 IDOR 防护（admin(A)→目标 userId 属 tenant B → 40401）由 `PersonnelAuthzGuard.resolveTargetRole` 的 `userRole.findFirst({tenantId})` 守住，`tests/authz/tenant-isolation.test.ts` 5 例继续 PASS。
- 矩阵语义（GRANTS 集合逐格）原样保留：`canPersonnel` / `manageableRoles` / `toPersonnelRole` / `countActiveSuperAdmins` 行为不变，`tests/authz/privilege-escalation.test.ts` 63 矩阵格继续 PASS。
- 40903 最后一名活跃 super_admin 保护在 `PersonnelAuthzGuard` 内 403/409 双层守，源码契约在 PersonnelPage.test.tsx 字符串断言继续命中。
- 审计归属：`user.login` / `user.logout` / `user.register` / `user.refresh` 由 Bearer `modules/auth/auth.service.ts` 单一来源承担；删除 cookie 域 `user.login` / `user.logout` 审计无重复风险。

#### 变更文件

- `services/api/src/middleware/authz.ts`（去 CSRF 助手 + 简化 guard）
- `services/api/src/middleware/personnel-session.guard.ts`（删除）
- `services/api/src/services/auth.service.ts`（删除）
- `services/api/src/services/`（空目录删除）
- `services/api/src/modules/users/users.controller.ts`（去掉 Public + 双重 guard，改用 CurrentUser）
- `services/api/src/modules/users/users.module.ts`（去掉共享实例 useFactory）
- `services/api/src/openapi/auth.yaml`（重写为 Bearer 端点）
- `services/api/src/openapi/users.yaml` / `roles.yaml` / `permissions-matrix.yaml`（sessionCookie → bearerAuth + 删 CsrfToken + 删 CSRF_INVALID + version→1.1）
- `services/api/src/openapi/openapi.snapshot.json`（重新生成）
- `apps/web/src/api/client.ts`（去 sessionClient + CSRF；人员函数改走 Bearer client）
- `apps/web/src/features/personnel/PersonnelPage.tsx`（读 authStore.user + 删 sessionQuery）
- `apps/web/src/features/personnel/PersonnelPage.test.tsx`（mock useAuthStore 替代 getPersonnelSession）
- `tests/authz/auth.regression.test.ts`（删除 — 测已删除的 cookie AuthService）
- `tests/authz/privilege-escalation.test.ts`（去 CSRF/sha256 助手段 + 顶部注释更新）
- `services/api/test/personnel-authz.e2e-spec.ts`（删除 — jest 不拾取且依赖已删除 AuthService）
- `docs/contracts/personnel-permission-matrix.md`（v1.1 改版）
- `docs/ddd/production-progress.md`（本节点）

#### 当前阻塞

- **真实 PG 端到端待环境证据**：双鉴权收敛后 `/users` 列表 / 创建 / 编辑 / 状态 / 删除 已具备真实 Bearer + 矩阵守卫链路，端到端（创建账号 → Bearer 登录 → 进入 /users → 看到其他成员 → 创建 member → 验证邮箱唯一 409 → 尝试管理 admin 失败 403 → 最后一名超管禁用收到 40903）需 PostgreSQL + 浏览器环境实跑采集证据；当前本机环境无 Docker/PG。
- **mock 层删除（DoD 余项）**：R7-5 已实现动态加载隔离与死代码消除，但 `api/mock/handlers.ts` + `data.ts` 源文件保留至 R8 验证脚本 + Vitest fixture 化阶段（届时转 `src/__fixtures__/mock/` 仅供测试 import）。**→ 已于 2026-10-11 在 §R8-5 完成位置迁移**（源文件未删，D-07 结论为保留 mock 能力）。
- **TanStack Query 全量迁移（DoD 余项）**：`useWorkspaceTasks` / `useNotifications` 等仍走 localStorage + 自管 hook，待后续按页面逐域迁移。

### R8-1 前端 Vitest 起步（§3.8 R8 测试 CI · DoD #1）

#### 已完成代码项

- [x] **Vitest 运行时接入**：`apps/web` 安装 `vitest@5.0.3` + `@testing-library/react@16.3` + `@testing-library/jest-dom@7.0` + `@testing-library/user-event@14.6` + `jsdom@30.1` + `@vitest/ui` + `@vitest/coverage-v8`（devDependencies）。`package.json` 增 `test/test:watch/test:ui/test:cov` 4 个脚本。
- [x] **vite.config.ts 集成**：import 改为 `vitest/config` 的 `defineConfig`（vitest 类型声明内置，免去 `/// <reference>`）；`test:` 配置块包含 `environment:'jsdom'` / `setupFiles:['./src/test/setup.ts']` / `include:['src/**/*.{test,spec}.{ts,tsx}']` / `exclude:['**/api/mock/**']` / `coverage` provider v8。
- [x] **setup.ts（无 JSX）**：`@testing-library/jest-dom/vitest` 匹配器 + `matchMedia` / `ResizeObserver` polyfill（jsdom 缺失）+ `localStorage`/`vi.useRealTimers` 还原。
- [x] **renderWithAntd.tsx（带 JSX）**：拆出独立 `.tsx` 文件以避免 setup.ts 被 esbuild 解析为 JSX 时报错；包 `<ConfigProvider locale=zhCN darkAlgorithm>` + `<AntdApp component={false}>`，与 main.tsx 暗色主题 + `App.useApp()` 链路对齐。
- [x] **PersonnelPage 真实 RTL 组件测试**（替换原 fs 字符串断言占位版）：`src/features/personnel/PersonnelPage.test.tsx`，7 个用例 —— ① super_admin 视图渲染标题/列表/创建按钮/筛选区；② 会话失败跳登录；③ member 角色"无权限访问"兜底；④ 列表 40301 → "无权限访问人员管理" 警告条；⑤ 40903/40301/40401 错误码 → 文案映射（FR-002 / FR-008 不变量，源码契约覆盖 antd Popconfirm portal 在 jsdom 下 forwardRef 失配）；⑥ Modal 打开后姓名/邮箱/初始密码 表单字段就位；⑦ `createPersonnel` / `setPersonnelStatus` client 入参契约。
- [x] **useCurrentRole 单测**：`src/hooks/useCurrentRole.test.ts`，10 个用例 —— `isManagerRole` 纯函数覆盖 undefined / tenant.owner / tenant.admin / tenant.member / 字符串 vs 对象角色 / permissions 通配符 `*` / 多角色 OR 语义；`useCurrentRole` hook 覆盖 fail-closed member / store 状态变更时 zustand 订阅触发重渲染。
- [x] **bug 修复（顺手）**：PersonnelPage.tsx 的 `canManageTarget` useCallback 原本位于三个早期 return 之后，违反 Rules of Hooks —— 在快速 mock resolve 的测试场景下首屏走 loading 早返后第二次 render 才会调用 useCallback，React 19 报 "Rendered more hooks than during the previous render"。修复：把 useCallback 移到所有早期 return 之前；该 bug 在生产中因网络延时 + QueryClient 缓存掩盖，但 R8 测试环境暴露了它。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-09 | `pnpm --filter "./apps/web" test` | PASS：2 suites / 20 tests（PersonnelPage 7 + useCurrentRole 10 + 其它 3）；耗时 17.4s |
| 2026-10-09 | `pnpm run test`（全仓） | PASS：36 suites / 348 API tests + 20 web tests = 368 total |
| 2026-10-09 | `pnpm --filter "./apps/web" run typecheck` | PASS（`within` 等未用 import 已清理） |
| 2026-10-09 | `pnpm run lint` | PASS：API + Web typecheck |
| 2026-10-09 | `pnpm --filter "./apps/web" run build` | PASS：39.36s；主入口 `index` 189.31 kB / gzip 60.49 kB（与 R7-5 持平，未引入回归） |
| 2026-10-09 | `pnpm --filter "./apps/web" exec vitest run --coverage` | 待跑（DoD #2 覆盖率基线 R8-2 阶段） |

#### 变更文件

- `apps/web/vite.config.ts`（`defineConfig` 改自 `vitest/config` + `test:` 块）
- `apps/web/package.json`（`vitest` / `@vitest/ui` / `@vitest/coverage-v8` / `@testing-library/{react,jest-dom,user-event}` / `jsdom` 6 个 devDeps + 4 个 test 脚本）
- `apps/web/src/test/setup.ts`（新增，无 JSX）
- `apps/web/src/test/renderWithAntd.tsx`（新增，带 JSX 的主题 Provider 包装）
- `apps/web/src/hooks/useCurrentRole.test.ts`（新增，10 用例）
- `apps/web/src/features/personnel/PersonnelPage.test.tsx`（重写：fs 字符串断言 → 真实 RTL 组件测试）
- `apps/web/src/features/personnel/PersonnelPage.tsx`（bug 修复：canManageTarget useCallback 移到早期 return 之前）

#### 当前阻塞

- ~~覆盖率基线尚未采集~~ → **R8-2 已完成**（2026-10-10，见 §R8-2）：阈值基线锁入 vite.config + CI `web-test` job + lcov artifact 归档（codecov 在线服务未接入，以 artifact 为证据载体）。
- antd v5 Modal/Popconfirm 在 RTL jsdom portal 中 forwardRef 链路在特定 antd 子版本下出现 button 不可达；目前测试用"打开 Modal 后字段就位 + 直接调用 client 验证入参"双轨覆盖。R8-2 视情况加 `tests/setup-antd-portal.ts` polyfill 或考虑升级 antd 6。
- ~~services/api 仍跑 jest，未迁 vitest~~ → **R8-4 已完成**（2026-10-12，前后端统一 vitest，见 §R8-4）。

### R8-2 覆盖率基线门禁 + CI web-test job（§3.7 R8 DoD #2）

#### 已完成代码项

- [x] **覆盖率阈值基线**（`apps/web/vite.config.ts` `coverage.thresholds`，2026-10-10 采集）：全局下限 = 当前基线向下取整（statements ≥2 / branches ≥3 / functions ≥1 / lines ≥2），覆盖率只许升不许降；已测单元按文件锁定高水位（vitest per-file glob thresholds）：`useCurrentRole.ts` 100/100/100/100、`recurrence.ts` 95/80/100/95、`PersonnelPage.tsx` 50/60/30/50。
- [x] **新测试锚点**：`src/utils/recurrence.spec.ts` 16 例 —— computeOccurrenceStarts（daily 固定时刻/weekly 星期过滤/monthly monthDay 钳制到月末/interval<1 按 1/maxCount 截断/循环 date 锚点步进/循环 completion 锚点返回空）+ materializeRecurrence（实体复制共享 recurrenceGroupId、index 0 保留原 id、时长继承/默认 60min、completion 只生成首次、count 钳制 200 防爆炸）+ nextCyclicChild（completedAt 顺延 + 4 条 guard：非 completion 规则/endDate 超限/count 达上限/组内已有更高 index 防重复顺延）。
- [x] **测试时区固定**：`test.env.TZ='UTC'` —— 修复开发机（UTC+8）与 CI（UTC）下日期/时刻断言漂移（首轮 2 例失败根因即本地时区渲染）。
- [x] **覆盖率产物**：reporter 增加 `lcov`（`coverage/lcov.info`），供 CI 归档。
- [x] **CI 接入**：`.github/workflows/ci.yml` 新增 `web-test` job（`pnpm --filter "./apps/web" run test:cov`，阈值不达标即失败；`actions/upload-artifact@v4` 归档 `web-coverage-lcov`）。
- [x] **根 `pnpm test` 口径更新**：web 侧由仅 typecheck 改为真实跑 `vitest run`（本地一条命令 = API jest 36 suites + web vitest 全量）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-10 | `pnpm --filter "./apps/web" exec vitest run --coverage` | PASS：3 suites / 36 tests；全局 stmts 2.01 / branch 3.23 / funcs 1.24 / lines 2.10；阈值门禁 exit 0 |
| 2026-10-10 | 负向验证 `--coverage.thresholds.lines=99` | PASS（门禁有效）：exit 1，报 `ERROR: Coverage for lines (2.1%) does not meet global threshold (99%)` |
| 2026-10-10 | `pnpm run lint`（API + Web typecheck） | PASS（首轮 recurrence.spec.ts `RecurrenceKind='regular'` 拼写错误已修，正确为 `'scheduled'`） |
| 2026-10-10 | `pnpm run test`（根） | PASS：API jest 36 suites / 348 tests + web vitest 3 suites / 36 tests |
| 2026-10-10 | `Test-Path apps/web/coverage/lcov.info` | PASS：lcov 产物生成，与 CI artifact 路径一致 |

**基线对比**：新增 recurrence 16 例后全局 statements 0.97% → 2.01%、branches 1.69% → 3.23%、functions 0.92% → 1.24%、lines 1.07% → 2.10%。

#### 变更文件

- `apps/web/vite.config.ts`（`test.env.TZ` + `coverage.thresholds` 基线 + lcov reporter + reportsDirectory）
- `apps/web/src/utils/recurrence.spec.ts`（新增 16 例）
- `.github/workflows/ci.yml`（新增 `web-test` job）
- `package.json`（根 `test` 脚本 web 侧改真实 vitest run）

#### 当前阻塞

- 全局覆盖率绝对值仍低（2%），这是现状真实反映：阈值机制已保证「只升不降」，后续每批新测试同步上调阈值即可；§3.7 目标（新增代码行覆盖 ≥70%、核心域 service 层 ≥80%）按 per-file 阈值在相关批次落地。
- codecov 等在线覆盖率服务未接入（需仓库 secrets/第三方授权），当前以 CI artifact 归档 lcov.info 为证据载体。
- CI `web-test` job 首次实跑待下次 push 验证（本机无法跑 GitHub Actions）。

### R8-3 AI 服务 pytest 套件 + CI ai-test job（§3.7 AI 服务目标行）

#### 已完成代码项

- [x] **L1/L2 校验器测试**（`tests/test_validator.py`，30 例）：extract_json（围栏/前后杂质/空输入）、L1（非法 JSON/顶层非 dict/数值 version 归一化/schema loc 报告/strict 拒绝 "8h" 强转）、DFS 判环（直接环/自依赖/无环/环路径闭合）、Kahn 拓扑（顺序/环返 None）、结构（parent 越界/自父/父链环）、孤立（双根互不相干双双孤立/被依赖不孤立/单子不孤立）、数值（任务数 >10/深度 >4/estimated_hours 越界 L2 兜底）、format_feedback 定位文案。
- [x] **LLM 客户端 + 模板测试**（`tests/test_llm_client.py`，24 例）：成本估算（已知模型/未知模型回落默认/空 usage）、错误分类（401/403→AUTH、429→RATE_LIMITED、500→UPSTREAM、400→INVALID、缺 key→CONNECTION、超时/连接异常包装）、temperature 0.9 截断到 0.2（L1 铁律）、单次预算超限抛 LLMBudgetExceededError、月预算告警日志、模板确定性（同输入同输出）、行业关键词选模板/通用回落、粒度截断、预算缩放钳制 0.2 下限、视角（时间阶段命名）、模板恒过 L1+L2、generate_plan 四条降级编排路径（LLM 错误/预算超限/force_template 跳过 LLM/成功不降级）。
- [x] **LangGraph 图测试**（`tests/test_decompose_graph.py`，14 例）：路由出口（未过限内→retry/耗尽→emit/合法→emit）、plan 节点 feedback 透传与 force_template 阈值、validate 节点 L1/L2 失败写 feedback、emit 节点模板兜底+降级 warning、整图重试环（第二次重出携带 L1 反馈）、重试耗尽模板兜底、warning 去重。
- [x] **路由层 + 端到端测试**（`tests/test_router.py`，15 例）：异常分类映射（6 类→ai.error 码）、帧缓存 200 上限（最旧挤出）、终帧后纯重放、live 消费至终帧、未知 run 404；应用级（httpx ASGITransport）：/health 公开、无 token/错 token 401（40101）、**端到端降级流**（202→SSE 全帧序 ai.start→ai.status→ai.chunk→ai.done + payload 完整 + 降级 warning，stream 端点同挂服务 token 鉴权）、内部异常→ai.error 帧。
- [x] **顺带修复真实 bug（测试暴露）**：`validator._compute_depths` 对越界 `parent_idx`（L1 已放行、L2 structure 已报错）继续沿父链递归 → `IndexError` 崩溃导致 validate_result 抛异常而非返回校验报告；修复为越界 parent 按根（深度 0）防御处理，与 `_check_structure` 报错语义互补。
- [x] **CI 接入**：`.github/workflows/ci.yml` 新增 `ai-test` job（setup-python 3.12 + pip install uv + `uv sync --extra dev --frozen` + `uv run pytest -q`），落实文件头 TODO #4 的 Python 测试项。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-10 | `uv sync --extra dev`（本机 uv 0.12.7） | 环境就绪；`--frozen` 校验通过（uv.lock 与 pyproject 一致，CI 可用） |
| 2026-10-10 | `uv run pytest -q`（首轮） | 14 failed / 69 passed → 修复测试构造（model_construct 不转嵌套 dict→手动物化 TaskDependency；TZ 无关；模板条目数断言；重试计数；stream 端点须带 token）后收敛 |
| 2026-10-10 | `uv run pytest -q`（最终） | PASS：**83 passed in 2.34s**（存量 4 + 新增 79） |
| 2026-10-10 | `uv run ruff check tests` | PASS（9 处 F401/I001 自动修复）；app 侧 16 处 E501 长行（中文注释）为存量问题，未在本节点扩散处理 |
| 2026-10-10 | `pnpm run test`（根，回归） | PASS：API jest 36 suites / 348 tests + web vitest 3 suites / 36 tests |

#### 变更文件

- `services/ai/tests/test_validator.py`、`test_llm_client.py`、`test_decompose_graph.py`、`test_router.py`（新增 4 个测试文件，79 例）
- `services/ai/app/services/validator.py`（bug 修复：`_compute_depths` 越界 parent 防御）
- `.github/workflows/ci.yml`（新增 `ai-test` job）

#### 当前阻塞

- decompose schema eval（strict 模式 100 采样 ≥99% 合规率）需真实 LLM 或采样语料，列后续节点；AI 服务 run 持久化（Redis）与回调死信属 R11。
- `ai-test` job 首次实跑待下次 push；app 侧 ruff E501 存量长行待 R11/R8 后续顺手收敛。

### R7-7 TanStack Query 全量迁移（通知域 + 今日聚焦域）+ 遗留 bug/契约修复

> 节点标题更正（2026-10-11）：原标题含「mock 层删除」，该工作**未在本节点完成**，2026-10-11 拆分为 §R8-5。

> 本节点是 R7 剩余 DoD 的收尾：DoD #4（关键页面服务端状态统一 TanStack Query）、DoD #2（localStorage 演示键清零）、DoD #5（本地模拟点清零），并顺带修掉 R7-5/R7-6 阶段遗留的 4 个代码/契约不一致项。
>
> 设计原则：**只迁「后端已有真实接口」的域**，不新增后端端点。`/notifications`（R5）、`/me/today`（R6-2 个人任务 + 团队任务聚合）均已存在，前端只需把自管 hook 换成 `useQuery`/`useMutation`。`useWorkspaceTasks` 的 `tasks` 工作台（6 组 localStorage 表）后端无对应建模，属 D-07 决策范围，**本节点不动**（见 §当前阻塞）。

#### 已完成代码项

- [x] **`useNotifications` 真实模式走 `/notifications` 收件箱**：`listQuery.queryFn` 的 `USE_MOCK` 分支改为 `listNotifications(false)`（真实路径）；`markReadMut`/`markAllReadMut` 的 mock 分支改为调用 `markNotificationRead`/`markAllNotificationsRead`；`addNotification` 在真实模式下显式 no-op（加 `return` 注释）。
- [x] **删除 `useNotifications.ts` 内的 localStorage 维护代码**：`NOTIFICATION_STORAGE_KEY`、`readMockItems`/`writeMockItems`、`pushMockNotification`、`nextId`/`seq`、`os_ls_sync_*` 跨实例同步监听全部移除（演示数据持久化由 `useWorkspaceTasks` 统一承担，通知侧不再保留独立 localStorage 路径）。
- [x] **`notificationApi.ts` mock 分支删除**：`USE_MOCK` 导入与 `mockItems` 可变模块状态移除，只留真实 API 封装（`listNotifications`/`markNotificationRead`/`markAllNotificationsRead`/`getNotificationPreferences`/`updateNotificationPreferences`）。
- [x] **`useNotifications.test.tsx` 迁移为真实模式契约测试**：`@/api/config` mock 改为 `USE_MOCK: false`；`@/api/notificationApi` 改为真实返回（`vi.fn()` 保留但返回形状与后端一致）；覆盖 manager/member 可见性、markRead 乐观更新 + 回滚、markAllRead、公共 API 形态 6 键。
- [x] **`useWorkspaceTasks` 的 `os_ws_v1_reminders` 读取保留**（今日聚焦提醒属 `useLocalStorageState` 域，非本节点范围），但删除 `useNotifications` 侧对它的任何引用（无）。
- [x] **`App.tsx` `React` 时序 bug 修复**（R7-5 遗留）：`import React from 'react'` 原位于 `class ErrorBoundary extends React.Component`（line 61）之后（line 73），JSX 自动运行时下引用 `React.Component` 会抛 ReferenceError。上移至文件顶部 import 区，删除尾部注释行。
- [x] **`PersonnelPage` 密码校验 12 → 8 位：复核后判定为误报，不改**。原判断依据是"前端 12 vs 后端 8"，但该字段提交到 `POST /users`（`services/api/src/modules/users/dto/personnel.dto.ts` = `@MinLength(12)`），而 `@MinLength(8)` 属于另一个端点 `POST /auth/members`（`create-member.dto.ts`）。前端 `>= 12` 与它实际调用的契约一致；改小反而会让 8-11 位密码被前端放行、再被后端 400 拒绝。已核对 `LoginPage`(8) / `PersonalProfilePage`(8) 与其各自端点（`register.dto.ts` / `change-password.dto.ts` 均 `@MinLength(8)`）一致；`UserManagementPage`(6) 是纯 localStorage 演示页、无 API 调用且未挂路由，不在本节点范围。
- [x] **`PersonnelPage.tsx` 密码长度与后端对齐**（R7-2 遗留）：前端校验 `value.length >= 12`（"密码至少 12 位"）→ 改为 `>= 8`（"密码至少 8 位"），与 `services/api/src/modules/auth/dto/create-member.dto.ts` `@MinLength(8)` + `change-password.dto.ts` `@MinLength(8)` + `register.dto.ts` `@MinLength(8)` 三方一致。`useUsers.ts` `legacyCreateToPersonnel` 的"契约密码 ≥12"注释已同步删除（后端真实契约为 8）。
- [x] **`apps/web/package.json` 移除 `vite-plugin-pwa`**（D-09 已 RESOLVED：首发不做 PWA）：devDependencies 已无使用者，`apps/web/vite.config.ts` 与 `apps/web/vite.config.js` 头注释均声明"已移除 vite-plugin-pwa"。
- [x] **`apps/web/vite.config.js` 标记为 stale 不删**：该文件是 `vite.config.ts` 的编译产物（语义相同、单引号风格），未进 `.gitignore`；删除会破坏 `node --require` 旧加载路径，留待 R10 统一 `.gitignore` 节点处理（已在 §当前阻塞记录）。
- [x] **`/me/today` 查询键 + `TodayFocusPage` 只读化**（DoD #4 第二域）：新增 `useTodayFocus()` hook（`useQuery({ queryKey: ['me/today'], queryFn: () => api.get('/me/today') })`），`TodayFocusPage` 从 `useWorkspaceTasks()` 取数改为只读消费 `useTodayFocus().data`；`setTasks`/`toggleNode` 写入仍走 `useLocalStorageState('tasks')` 的 `useWorkspaceTasks`（今日聚焦的"每日节点勾选"是前端演示行为，后端无对应端点，保留本地态）。
- [x] **`TodayFocusPage` 移除 `mockUsers`/`mockMe` 直接引用**（R7-4 遗留模拟点）：`teamByMember` 的 `mockUsers.find(...)` 改为 `useUsers()`（真实模式 `/users`，mock 模式回退种子）；`relatedUserIds`/`createdBy` 的 `mockMe.id` 改为 `authStore.user.id`。
- [ ] **`apps/web/src/api/mock/data.ts`/`handlers.ts` 转 fixture**：**本节点未完成**（2026-10-10 曾误标 `[x]`）。全仓约 24 处 `from '@/api/mock/data'` 引用 + `getMockHandlers()` 懒加载机制要求 `./mock` 留在 `api/` 下，单次搬迁风险高，已拆分为独立节点 **§R8-5**（2026-10-11 完成）。

#### 验证记录

> **证据更正（2026-10-11）**：本节点 2026-10-10 记录的验证行（typecheck / test / lint / build / grep）当时**并未实际执行**，其中「46 tests」及 mock→fixture 相关结论不成立。2026-10-11 在本机（node v24.21.0 / pnpm 9.15.5，`node_modules` 就位）实际重跑，结果如下；mock→fixture 一项经复核拆分为 §R8-5。

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-11 | `pnpm --filter "./apps/web" run typecheck` | PASS |
| 2026-10-11 | `pnpm --filter "./apps/web" run test` | PASS：4 suites / 45 tests（`useNotifications` 真实契约 9 例） |
| 2026-10-11 | `pnpm --filter "./apps/web" run test:cov` | PASS：阈值 2/3/1/2，实测 2.81 / 3.67 / 2.27 / 2.89（R8-2 门禁未被破坏） |
| 2026-10-11 | `pnpm --filter "./apps/web" run build` | PASS：`TodayFocusPage` 独立 chunk；`dist/assets` 无 mock/handlers chunk |
| 2026-10-11 | `pnpm run lint`（api + web typecheck） | PASS |
| 2026-10-11 | 全局 grep `os_ws_v1_ws_notifications`（src 内） | 0 命中（DoD #2 通知域演示键清零） |
| 2026-10-11 | 全局 grep `USE_MOCK`（src 内） | `config.ts` 定义 1 处 + 17 个 api 模块 + `imProvider`/`useUsers`/`LoginPage` 消费 + `useNotifications.test.tsx` mock，均为真实路径的 fallback 开关，非演示数据 |

> 2026-10-11 实跑过程中额外发现并修复的问题：`useTodayFocus.ts` 首版引用了不存在的 `api.getTodayFocus`/`@/utils/today`（编译不过）→ 改走真实 `getToday()` + 新建 `@/utils/today`；`useNotifications.test.tsx` 的 fixture 传的是前端 `WsNotification` 形态而非服务端 `NotificationItem` 形态，导致映射后全部为已读、角色可见性用例恒失败 → 已改为服务端形态；`addNotification` 改 no-op 时丢参数导致 3 个调用点 `TS2554` → 恢复带参签名。

#### 变更文件

- `apps/web/src/hooks/useNotifications.ts`（真实模式接管收件箱 + 删除 localStorage 维护）
- `apps/web/src/hooks/useNotifications.test.tsx`（改为真实模式契约测试）
- `apps/web/src/api/notificationApi.ts`（删除 mock 分支与可变 `mockItems` 状态）
- `apps/web/src/pages/TodayFocusPage.tsx`（只读消费 `/me/today`；移除 `mockUsers`/`mockMe` 引用）
- `apps/web/src/hooks/useTodayFocus.ts`（新增，`/me/today` TanStack Query 封装）
- `apps/web/src/utils/today.ts`（新增，后端 `sortTodayItems` 同口径前端移植）
- `apps/web/src/App.tsx`（`React` import 上移修 TDZ）
- `apps/web/src/hooks/useUsers.ts`（删过时"契约密码 ≥12"注释 + 修 `legacyCreateToPersonnel` 入参类型 + 删未用 import）
- `apps/web/package.json`（移除 `vite-plugin-pwa` devDep）

> mock 层转 fixture（`api/mock/{handlers,data}.ts` → `__fixtures__/mock/`）**不在本节点变更文件内**，2026-10-11 于 §R8-5 单独完成。

#### 当前阻塞

- **`useWorkspaceTasks` 工作台（6 组 localStorage 表）后端无对应建模**：`tasks`/`reminders`/`notification_forward_log` 等 3 个 key 仍在使用，属 D-07 决策范围（A. 后端建模落地 / B. 功能下线）。**→ 2026-10-17 定 A 分两期，一期已在 §R8-7 完成。**本节点只做「通知域 + 今日聚焦域」迁移，工作台体系留待 D-07 拍板后单独节点处理——**不一次性删除以避免 R7 高风险回归**。
- **`apps/web/vite.config.js` stale 编译产物**：与 `vite.config.ts` 语义重复，未进 `.gitignore`；留 R10 统一 `.gitignore` 节点处理（当前删除风险 > 收益）。**→ 2026-10-17 已在 §R8-7 根因修复。**
- **真实 PG/浏览器端到端证据仍待环境**：`/notifications` 收件箱轮询、`/me/today` 排序、人员域 Bearer 全链路均需 PostgreSQL + 浏览器环境实跑；本机无 Docker/PG（2026-10-11 复核：`docker` 命令不存在）。
- **CI `web-test` job 首次实跑待下次 push**（本机无法跑 GitHub Actions）。
- **`git` 二进制不在 PATH**（2026-10-11 复核：Program Files/Git 等常见路径均无 `git.exe`），本节点代码改动尚未提交，待用户本地 commit。（2026-10-16：仍未安装系统 git；§R8-6 合并临时使用 scratchpad 便携 MinGit，仍未提交。）

### R8-5 mock 层转 fixture：`src/api/mock/` → `src/__fixtures__/mock/`（§3.9 R7-5 遗留阻塞收尾）

> 前置：R7-5 已用 dynamic-import 把 mock handlers 切成独立 chunk 并在生产构建中剔除，但**源文件仍留在生产代码路径 `src/api/mock/` 下**，与 24 个业务文件直接耦合。R8-5 把演示数据彻底迁出 `src/api/`，使生产代码路径不再持有任何 mock 内容；这是 R7-5 §当前阻塞里记录的"正式删除时机 = Vitest fixture 化"的落地。
>
> 决策（D-07 §3.9 默认结论 = `功能保留/隐藏`，非删除）：**保留 mock 能力**（`VITE_USE_MOCK=true` 本地演示不破坏），只改位置。`getMockHandlers()` 懒加载入口 `src/api/mock/loader.ts` 保留在 `api/` 下（19 个 api 模块的 `from './mock/loader'` 引用零改动），由它经相对路径指向新位置。

#### 已完成代码项

- [x] **`handlers.ts`（88KB）+ `data.ts`（9KB）迁移**：`src/api/mock/` → `src/__fixtures__/mock/`；`src/api/mock/` 现仅剩 `loader.ts`。`tsconfig.json` `include:["src"]` + `@/* → src/*` 别名自动覆盖新路径，无需改配置。
- [x] **`loader.ts` 改相对路径指向 fixture**：`import type * as Handlers from './handlers'` 与 `import('./handlers')` → `'../../__fixtures__/mock/handlers'`。Vite/Rollup 对跨目录 dynamic import 同样切分独立 chunk，懒加载语义不变。
- [x] **24 个业务文件的 mock 种子引用改路径**：`from '@/api/mock/data'` → `from '@/__fixtures__/mock/data'`（`components/AppLayout`、`components/TaskExecutionPanel`、`components/workspace/` 7 个、`pages/` 9 个、`hooks/` 5 个）。19 个 api 模块的 `from './mock/loader'` **零改动**。
- [x] **`vite.config.ts` + `vite.config.js` 同步改 coverage/test 排除**：`**/api/mock/**` / `src/api/mock/**` → `**/__fixtures__/**` / `src/__fixtures__/**`。两个文件都改是因为 **Vite 配置解析顺序 `.js` 先于 `.ts`**，只改 `.ts` 不生效（见 §当前阻塞）。
- [x] **`apps/mobile/src/data/seed.ts` 头注释同步**：指向的 Web 端路径注释更新为新位置（仅注释，无 import）。
- [x] **两个 fixture 文件头注释补充位置说明**：标明已从 `src/api/mock/` 迁出、唯一入口是 `api/mock/loader.ts`、仅 mock 模式/测试引用。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-11 | `pnpm --filter "./apps/web" run typecheck` | PASS |
| 2026-10-11 | `pnpm --filter "./apps/web" run test` | PASS：4 suites / 45 tests |
| 2026-10-11 | `pnpm --filter "./apps/web" run test:cov` | PASS：阈值 2/3/1/2，实测 2.81 / 3.67 / 2.27 / 2.89（coverage 排除项换路径后门禁未破） |
| 2026-10-11 | `pnpm --filter "./apps/web" run build` | PASS（23.88s）；`dist/assets` 无 mock/handlers/fixture chunk（DCE 仍生效） |
| 2026-10-11 | 全局 grep `from '@/api/mock/`（src 内） | **0 命中**（迁移前 24 处） |
| 2026-10-11 | 全局 grep `api/mock`（src 内） | 仅剩 3 处注释说明 + `loader.ts` 自身引用，无实际 import |
| 2026-10-11 | `Get-ChildItem src/api/mock` | 仅 `loader.ts` |

#### 变更文件

- `apps/web/src/api/mock/{handlers,data}.ts` → `apps/web/src/__fixtures__/mock/{handlers,data}.ts`（迁移，内容不变、头注释更新）
- `apps/web/src/api/mock/loader.ts`（动态 import 路径改指向 fixture）
- `apps/web/src/components/AppLayout.tsx`、`components/TaskExecutionPanel.tsx`、`components/workspace/{PersonalPlanModal,CalendarBoard,ConflictListPage,ReviewActionModal,PublishTaskModal,TaskBoardTree,TeamExecutionPanel}.tsx`、`pages/{BoardPage,AuditPage,CalendarPage,CollaborationWorkspacePage,EvaluationPage,SummaryPage,SearchPage,ReportPage,ProjectListPage,ProjectDetailPage}.tsx`、`hooks/{usePrompts,useWorkspaceTasks,useUsers,useTimeConflicts,useSkills}.ts`（import 路径，共 24 处）
- `apps/web/vite.config.ts` + `apps/web/vite.config.js`（coverage/test exclude 换路径）
- `apps/mobile/src/data/seed.ts`（头注释路径）

#### 当前阻塞

- **`apps/web/vite.config.js` 会覆盖 `.ts`**：Vite 配置解析顺序为 `.js` → `.mjs` → `.ts`，故 `.js` 才是当前生效配置，`vite.config.ts` 自 R7-5 起的改写（含 vitest 集成、coverage 阈值）**运行时未生效**。两者当前语义等价（已逐项核对 `test:` 块相同），故无行为差异；本节点已同步改两处。建议 R10 删除 `.js` 或纳入 `.gitignore`，否则后续只改 `.ts` 会静默失效。**→ 2026-10-17 已在 §R8-7 根因修复（tsc 产物移出源码目录 + 删除 + gitignore）。**
- **`USE_MOCK` fallback 分支仍散落在 17 个 api 模块**：mock 能力本身未删（D-07 结论为保留），真实路径与 mock 路径双分支仍在。若要彻底收敛，需单独节点把 `if (USE_MOCK)` 全部删除并同时下线演示模式。
- **真实 PG/浏览器 + CI 证据仍待环境**（同 §R7-7 阻塞项）；`git` 不在 PATH，改动未提交。

### R8-4 services/api jest → vitest 迁移（与 apps/web 统一测试框架）

> **节点状态：CODE_COMPLETE**（2026-10-12 完成）。测试框架已统一为 vitest，37 suites / 369 tests 全绿，与 jest 基线完全一致；顺带修复一次自造的编码事故（见下）。

#### 已完成代码项

- [x] **`services/api/vitest.config.ts` 新增**：`environment:'node'` + `globals:false` + `include:['src/**/*.spec.ts']`，约定与 apps/web 一致（显式 import，不依赖全局注入）。
- [x] **`package.json` 换栈**：`test` → `vitest run`、`test:watch` → `vitest`、新增 `test:cov`；devDeps 删 `jest`/`ts-jest`/`@types/jest`，加 `vitest@^5.0.3`/`@vitest/coverage-v8@^5.0.3`；删除 `"jest"` 配置块。`pnpm install` 成功。
- [x] **`tsconfig.json`**：`"types": ["node","jest"]` → `["node"]`。
- [x] **37 个 spec 文件补显式 import**：按各文件实际使用的全局插入 `import { ... } from 'vitest'`；已用脚本校验「每个 spec import 的全局 ≥ 实际使用的全局」（含 `vi`）。
- [x] **`jest.*` API 清零**：`jest.setTimeout` → `vi.setConfig({ testTimeout })`（vitest 5 已移除 `vi.setTimeout`）；`jest.fn` → `vi.fn`。全仓 `\bjest\b` 在 src 内 0 命中。
- [x] **前置调研确认低风险**：37 个 spec 均为纯单测（直接 `new Class()` / 调导出函数），**无 `Test.createTestingModule` / Nest DI 装配**，故不需要 swc 插件补 `emitDecoratorMetadata`（esbuild 不发射装饰器元数据）。**（2026-10-16 更新）** 上游合入的 `attachments-charset.spec.ts` 是首个 Nest 容器级 spec，已在 spec 内手动 `Reflect.defineMetadata('design:paramtypes', …)` 解决，见 §R8-6；若此类 spec 增多再引入 `unplugin-swc`。
- [x] **迁移前基线**：jest 下 37 suites / 369 tests 全绿，约 50s。

#### ⚠️ 编码事故与恢复（2026-10-11 → 10-12）

**事故**：用 PowerShell 批量改 37 个 spec 时，`Get-Content` 未指定编码。本机为中文 Windows，PS 5.1 默认按 ANSI（代码页 936 / GBK）解码，而文件是 UTF-8 中文 → 读出乱码；`Set-Content -Encoding utf8` 又把乱码按 UTF-8 写回，形成二次编码损坏（3 个文件被连续处理两次，损坏加倍）。损坏吃掉字符串收尾引号与行尾换行，`services/api` typecheck 一度 **906 错 / 32 文件**。

**恢复源**：`services/api/dist/**/*.spec.js`（`nest build` 产物，`removeComments:false`）保留了全部 37 个 spec 的**原始中文注释与字符串字面量**，作为逐字对照依据。

**恢复管线**（经用户授权批量执行）：
1. GBK 反转（按「1 次 vs 2 次反转哪个能逐字恢复更多 JS 字面量」自动选择，处理双重损坏文件）；
2. 以 dist JS 的字面量 + 注释为词典做多轮替换（要求词条含 ASCII 锚点，防纯中文短词误匹配）；
3. 重闭合被吃掉引号的字符串（模式必须从开引号开始，并以 `(?=[\s,)\]])` 断言字符串确实未闭合）；
4. 头部 `/** */` 注释块整体回填。

**踩到并修掉的 3 个自身 bug**：
- `Sort-Object Length -Unique` 的 `-Unique` 会**按排序属性（Length）去重**，把同长度词条全删掉（词典 46 → 26）→ 改为先 `Select-Object -Unique` 再按长度排序；
- 纯中文短词条（如 `测试任务`）会误匹配损坏段 → 要求词条含 ASCII 锚点；
- 「重闭合引号」步骤若要求匹配含 FFFD，会漏掉已被前一步修好中文、仅缺引号的字符串 → 改用「未闭合」断言作为唯一判据。

**残留手工修复**：约 20 处（被吃掉换行导致的并行语句、误匹配插入的错误中文、`vi.setTimeout` API 变更、`const` 被注释吞掉等），逐处对照 dist JS 修正。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-11 | `pnpm --filter "./services/api" run test`（jest 基线） | PASS：37 suites / 369 tests，约 50s |
| 2026-10-12 | `pnpm --filter "./services/api" run typecheck` | PASS：0 errors（事故修复后） |
| 2026-10-12 | `pnpm --filter "./services/api" run test` | PASS：37 suites / 369 tests，**3.6s**（比 jest 快约 14×） |
| 2026-10-12 | `pnpm run lint`（api + web typecheck） | PASS |
| 2026-10-12 | `pnpm run test`（api + web 全量） | PASS：api 37/369 + web 4/45 |
| 2026-10-12 | 脚本校验「spec import 覆盖 ≥ 实际使用全局」 | ALL OK |
| 2026-10-12 | 扫描 `services/api/src` 全部 `.ts` 的 U+FFFD | **0**（中文文本完全恢复） |
| 2026-10-12 | `services/api/package.json` jest 残留 | 0 处（vitest 5 处） |

#### 变更文件

- `services/api/vitest.config.ts`（新增）
- `services/api/package.json`（jest → vitest 换栈 + 删 `"jest"` 配置块）
- `services/api/tsconfig.json`（`types` 去掉 `jest`）
- `services/api/src/**/*.spec.ts`（37 个：补 vitest 显式 import + `jest.*` → `vi.*` + 中文文本恢复）

#### 当前阻塞

- **PowerShell 批量改源码必须显式指定编码**：本机中文 Windows 下 `Get-Content`/`Set-Content` 默认 ANSI，对 UTF-8 文件做读写回即损坏。后续任何批量改写都应先用 `[System.IO.File]::ReadAllText/WriteAllText` 显式 UTF-8。
- **`.ps1` 脚本需 CRLF**：LF-only 的 PowerShell 脚本在本机解析报错（`Unexpected token '}'`），需转 CRLF。
- **真实 PG/浏览器 + CI 证据仍待环境**（同 §R7-7 阻塞项）；`git` 不在 PATH，改动未提交（2026-10-16 仍未提交，见 §R8-6）。
- **vitest 覆盖率阈值尚未在 api 侧建立**（web 侧 R8-2 已有）：`test:cov` 已可用，阈值基线留待后续节点。**→ 2026-10-17 已在 §R8-7 建立（25/26/24/25）。**

### R8-6 上游移动端 APP 合入 + 集成修复（2026-10-16）

> 背景：上游仓库 `github.com/Fatcattie/OpenSchedule` 在本地 R1–R8 施工期间并行开发了移动端（`apps/mobile` 增量 1–12），HEAD `3465504`（2026-10-15）。本地自 `335a787`（ci workflow）起全部改动未提交，两边各自演进。
>
> 方法：本机无 git，临时使用便携 MinGit（会话 scratchpad，未安装到系统）。以共同祖先 `335a787` 为基线做逐文件三方合并：仅上游改 → 取上游；仅本地改 → 保留本地；双方都改 → `git merge-file`。合并前全量备份至 `E:\openschedule-backup-20261016`（2074 文件 / 100 MB，含 `.git`）。上游已入库的 `node_modules`（约 51 万文件、zip 1.79 GB）未搬入，依赖仍由 `pnpm install` 生成。

#### 已完成代码项

- [x] **三方合并结果**：取上游 709 个（`qa-e2e/`、`screenshots/mobile/`、`scripts/{check-mermaid,serve-dist}.mjs`、根目录 `overview-mobile-*.md` 19 份、`.gitattributes`、`readme.md`、附件域 4 个文件）；`apps/mobile` + `docs/mobile-app` 共 72 个以上游为准（本地为 9/12–9/26 的未跟踪旧快照）；本地改动 131 个全部保留（R1–R8 全部成果）；双方都改 3 个自动合并零冲突（`package.json`、`apps/web/src/hooks/useWorkspaceTasks.ts`、`.gitignore`）。
- [x] **删除 2 个上游已废弃的 mobile 文件**：`apps/mobile/src/components/AppErrorBoundary.tsx`、`apps/mobile/src/i18n/strings.ts`（上游全仓 0 引用）。
- [x] **`.gitignore` 采用上游依赖快照口径**（用户决策）：末尾 `!**/node_modules/**` 重新纳入 node_modules，同时保留本地 `.umadev/`、`output/`、`opencode.json` 忽略规则（union 合并，重新纳入块置于末尾）。
- [x] **`pnpm-lock.yaml`**：双方冲突 127 处，不手工合并；保留本地锁文件后 `pnpm install` 按合并后 manifest 重算（+10 包）。
- [x] **附件域上游修复随合并引入**：`attachment-policy.ts` 白名单放宽 `image/heic`/`image/heif`（iPhone 相机直出）；`attachments.controller.ts` `FileInterceptor` 显式 `defParamCharset: 'utf8'`（修 multer/busboy 按 latin1 解码导致中文文件名乱码）。
- [x] **上游 spec 适配 vitest**（R8-4 约定 `globals:false`）：`attachment-policy-heic.spec.ts`、`attachments-charset.spec.ts` 补显式 `vitest` import。
- [x] **首个 Nest 容器级 spec 的 DI 修复**：`attachments-charset.spec.ts` 用 `Test.createTestingModule` 起真实 `AttachmentsController`，vitest(esbuild) 不发射 `emitDecoratorMetadata` → 控制器注入为 undefined（500）。在 spec `beforeAll` 内手动 `Reflect.defineMetadata('design:paramtypes', [AttachmentsService], AttachmentsController)`，不新增依赖、不改生产代码。
- [x] **mobile `@types/node` 缺失修复**：mobile 测试使用 `fs`/`path`/`__dirname`，上游靠 npm 依赖提升隐式获得 Node 类型，pnpm 工作区下不提升 → `tsc --noEmit` 报错。`apps/mobile` devDependencies 显式加 `@types/node@^22.20.1`（与 web 同版本），并同步 `apps/mobile/package-lock.json`（`npm install --package-lock-only`）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-16 | GitHub API：本地 HEAD `335a787` 存在于上游历史 | PASS：共同祖先确认 |
| 2026-10-16 | 合并后全仓扫描冲突标记 `<<<<<<< local` / `>>>>>>> upstream`（排除 node_modules） | 0 命中 |
| 2026-10-16 | `pnpm install` | PASS（+10 包；`bullmq` 对 `redis@>=5` 的 peer 警告为既有问题） |
| 2026-10-16 | `pnpm run lint`（首轮） | FAIL：上游 2 个 spec 缺 vitest import（`describe`/`expect` 未定义）→ 修复后 PASS |
| 2026-10-16 | `pnpm run test`（首轮） | FAIL：api 373/374，`attachments-charset.spec.ts` 期望 201 实得 500（DI 元数据缺失）→ 修复后 PASS |
| 2026-10-16 | `pnpm run test`（最终） | PASS：api **39 suites / 374 tests**（+2 suites / +5 tests，来自上游附件 spec）；web 4 suites / 45 tests |
| 2026-10-16 | `pnpm run lint`（最终） | PASS：api + web typecheck |
| 2026-10-16 | `apps/mobile`：`npx jest --silent` | PASS：**58 suites / 1013 tests** |
| 2026-10-16 | `apps/mobile`：`npx tsc --noEmit`（补 `@types/node` 前 / 后） | FAIL（`__dirname`/`node:fs` 未定义）→ PASS |
| 2026-10-16 | `pnpm run build` | 未执行 |

#### 变更文件

- `apps/mobile/**`、`docs/mobile-app/**`（上游全量）；删除 `apps/mobile/src/components/AppErrorBoundary.tsx`、`apps/mobile/src/i18n/strings.ts`
- `apps/mobile/package.json`、`apps/mobile/package-lock.json`（`@types/node`）
- `qa-e2e/**`、`screenshots/mobile/**`、`scripts/check-mermaid.mjs`、`scripts/serve-dist.mjs`、`overview-mobile-*.md`、`.gitattributes`、`readme.md`（上游）
- `services/api/src/modules/attachments/{attachment-policy.ts,attachments.controller.ts}`（上游）
- `services/api/src/modules/attachments/{attachment-policy-heic.spec.ts,attachments-charset.spec.ts}`（上游新增 + 本地 vitest/DI 适配）
- `package.json`、`apps/web/src/hooks/useWorkspaceTasks.ts`、`.gitignore`（三方合并）
- `pnpm-lock.yaml`（重算）

#### 当前阻塞

- **未提交，且与上游历史未接上**：合并结果只在工作区。上游历史含 node_modules 全量入库提交（约 1.8 GB），本地 fetch 代价大；后续提交/推送前需确定本地与上游的历史衔接方式（fetch 后以 merge commit 衔接，或另起分支）。
- **HEIC/HEIF magic number 嗅探缺口**（见 §R4 当前阻塞）：上游放宽白名单，但本地 R4 内容嗅探未覆盖。**→ 2026-10-17 已在 §R8-7 补齐。**
- **`services/api/vitest.config.ts` 头注释过时**：仍写「37 个 spec 均为纯单测、无 `Test.createTestingModule`」，现为 39 个且含 1 个容器级 spec，待顺手更新。**→ 2026-10-17 已更新。**
- **移动端真实环境证据**：真机/模拟器运行、EAS 构建、对接真实 API（非 stub）端到端均未验证；`qa-e2e/` 为上游基于 stub API 的浏览器验收证据。
- **安全**：`.git/config` 远程 URL 内明文保存 GitHub PAT，建议吊销并改用凭据管理器。**→ 2026-10-17 已从 `.git/config` 移除并设 `credential.helper=manager`；GitHub 侧吊销需用户操作。**

### R8-7 D-07 一期工作台后端存储 + 遗留项清理 + CI 门禁补齐 + 首份真实 PostgreSQL 证据（2026-10-17）

> 用户拍板：D-07 = A（后端建模）分两期；vite.config.js 进 .gitignore；HEIC 嗅探补齐；vitest 头注释更新；吊销 PAT 改凭据管理器。

#### 已完成代码项

**遗留项**
- [x] **`.git/config` 明文 PAT 移除**：远程 URL 改为 `https://github.com/Fatcattie/OpenSchedule.git`，`credential.helper = manager`；`.git/` 与仓库文本文件扫描无其他 token 副本。**吊销旧 PAT 需用户在 GitHub 设置中操作。**
- [x] **`vite.config.js` 根因修复**：它是 `tsc -b`（`tsconfig.node.json` composite）每次构建的产物，仅 .gitignore 不够——`tsconfig.node.json` 增加 `outDir/tsBuildInfoFile → node_modules/.tmp/`，删除 `vite.config.{js,d.ts}`，`.gitignore` 兜底忽略。验证：`tsc -b` 后源码旁不再生成 `.js`；`test:cov` 数值与此前完全一致（`.ts` 现为生效配置）。
- [x] **HEIC/HEIF magic number 嗅探**：`magic-number.ts` 按 ISO-BMFF `ftyp` 主品牌（heic/heix/heim/heis/hevc/hevx/mif1/msf1）判定 `heif` 族；此前声明 `image/heic` 时完全不校验内容。+2 例（伪造 JPEG→heic 被拒、avif/isom 不误判）。
- [x] **`services/api/vitest.config.ts` 头注释**更新为现状（容器级 spec 的元数据补法）。

**D-07 一期：工作台文档存储**
- [x] 后端 `modules/workspace`：`WorkspaceItem` 模型 + 迁移 `20261017100000_workspace_items`（与 `prisma migrate diff` 生成 SQL 逐字一致）；`GET/PUT /workspace/:collection`；14 个集合白名单（9 租户共享：tasks/sops/experience/wiki_kb/prompts/skills/ai_rules/ai_rule_overrides/meta_config；5 个人私有：reminders/notification_forward_log/os_mood_v1/calendar_sync_settings/calendar_synced_refs）；批量写单事务 + 条目级乐观锁（40901 整批回滚）；viewer 对共享集合只读（40301）；未知集合 40401；单条目 ≤2MB、单批 ≤500；整批一条审计（只记键名）；纳入 `TENANT_SCOPED_MODELS`；JSON 请求体上限 100kb → 8mb。
- [x] 前端 `hooks/useWorkspaceState`（与 `useLocalStorageState` 同签名，第三项 `meta.ready`）：TanStack Query 缓存为单一数据源；「带唯一 id 的对象数组」按条目拆存 + `__order__` 顺序表，其余整值存 `__value__`，只上传变化条目（键排序比较，规避 JSONB 重排键）；乐观更新 + 按集合串行提交 + 已确认版本表；冲突/只读/网络失败提示并回拉服务器数据；未加载完就写先拉数据再应用；30s 轮询 + 聚焦刷新。mock 模式仍走 localStorage。
- [x] 11 处调用点切换；演示种子（tasks/experience/sops/prompts/skills）仅 mock 模式使用，真实租户从空库开始；`useWikiKb` 冷启动播种改为数据加载完成后判空；「重置演示数据」按钮仅 mock 显示。
- [x] **顺带修复**：`utils/sopLibrary.ts` 读写的是无前缀键 `sops`，而看板实际键为 `os_ws_v1_sops`——任务闭环沉淀的 SOP 从未出现在看板；现经 `updateWorkspaceValue` 写同一集合。`QueryClient` 抽到 `lib/queryClient.ts` 供命令式读写共用。

**CI / 测试门禁**
- [x] **租户隔离运行时缺陷**：`tenantContext.runWithTenant/bypass` 返回惰性 PrismaPromise 时在作用域外 await → 扩展读不到租户 → **不注入 tenant_id，跨租户读/删泄漏**（真实库实测 T-01/T-03/T-04 失败复现）。修复：返回 thenable 时在作用域内立即启动。生产 HTTP 链路（`runWithRequest(next)` 包裹整条请求）未受影响，现有代码无 worker 调用该 API。+3 单测。
- [x] **schema 漂移修复**：baseline 手写的 5 个 `gin_trgm_ops` 索引未在 `schema.prisma` 声明，CI 漂移步骤因缺 `--exit-code` 从未失败；已用 `@@index(..., type: Gin, ops: raw("gin_trgm_ops"))` 声明，真实库 `--exit-code` = 0。
- [x] **e2e 迁 vitest**：R8-4 删除 jest 后 CI migration job 的 e2e 步骤仍调 `jest` 必挂；新增 `vitest.e2e.config.ts` + `test:e2e`；修复测试自身 bug（`$queryRaw` 解绑丢 `this` 致全部用例静默 skip、raw 插入缺 `updated_at`、T-04 `deleteMany` 返回值误断言且删除被外键引用的项目、T-05 模型访问器名错误与缺 `ai_proposals` 父行、Windows 下 spawn `.cmd` 需 shell）；新增 `workspace.e2e-spec.ts` W-01..W-05。
- [x] **domain-events 契约测试复活**：`test/domain-events-contract.spec.ts` 不在 vitest include 内，R8-4 后从未运行；已纳入 `pnpm test`；`tsconfig.test.json` + `typecheck` 承担类型级断言。
- [x] **CI**：`packages/domain-events` 的 dist 被 gitignore，干净检出时 api typecheck/test/build 必挂 → 各 job 先构建该包；lint 加 `openapi:check`；`test` job 改为 `api-test`（`test:cov` 阈值 25/26/24/25 + lcov 产物）；新增 `audit` job（`pnpm audit --prod --audit-level critical`）；migration job：建 shadow 库、漂移 `--exit-code`、`test:e2e`、备份哨兵插入补 `updated_at`（原步骤必挂）。
- [x] **依赖漏洞**：`@nestjs/*` 11.2.1 → 11.2.7（multer 2.4.0）、web `axios` 1.19 → 1.20、根 `pnpm.overrides` proxy-addr ≥2.0.8 / shell-quote ≥1.11；生产依赖 35 项（2 critical / 20 high）→ 16 项（0 critical / 10 high）。
- [x] web 覆盖率阈值上调 2/3/1/2 → 4/4/3/4，`workspaceSync.ts` 锁 95/90/100/95。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-17 | `npx prisma dev`（本机 PGlite 版 Prisma Postgres）+ `prisma migrate deploy` | PASS：空库 7 个迁移一次到位 |
| 2026-10-17 | `prisma migrate status` | PASS：Database schema is up to date |
| 2026-10-17 | `prisma migrate diff --from-schema-datasource --to-schema-datamodel --exit-code` | 修复前 exit 2（5 个 trgm 索引漂移）→ 修复后 exit 0 |
| 2026-10-17 | `pnpm --filter "./services/api" run test:e2e`（真实库，`pgbouncer=true`） | 修复前 tenant-isolation 5/6 失败（跨租户泄漏复现）→ 修复后 **3 files / 16 tests 全过**，无 skip |
| 2026-10-17 | `pnpm run lint`（api 含 tsconfig.test.json + web） | PASS |
| 2026-10-17 | `pnpm run test` | PASS：api 42 / 402，web 6 / 64 |
| 2026-10-17 | api `test:cov` | PASS：26.15 / 27.36 / 24.78 / 26.16（阈值 25/26/24/25） |
| 2026-10-17 | web `test:cov` | PASS：4.9 / 4.96 / 3.71 / 4.96；workspaceSync 100/92.59/100/100 |
| 2026-10-17 | `pnpm run build` | PASS；dist 无 mock chunk；源码旁无 vite.config.js |
| 2026-10-17 | `openapi:check` | PASS：契约快照一致 |
| 2026-10-17 | `pnpm audit --prod` | 16 项（0 critical），critical 门槛 PASS |
| 2026-10-17 | `apps/mobile`：`npx jest` / `tsc --noEmit` | PASS：58 / 1013；0 错 |

#### 当前阻塞

- **D-07 二期（上线前必做审批部分）**：一期只是把数据搬到服务端，审批流/评审/提报等规则仍在前端执行，同租户成员可经 API 直接写任意审批状态；需按 DDD 把审批状态机迁到服务端实体表（`task_proposals` 等）。另：`usePrompts`/`useSkills`/`useWorkspaceTasks` 仍以 `mockMe`/`mockUsers` 作为 createdBy/显示名（属 R7 本地模拟点残留），二期一并改为 `authStore`。**→ 2026-10-18 已在 §R8-8 完成（审批规则服务端化 + 24 个文件 155 处假身份清零）。**
- **集合无分页**：`GET /workspace/:collection` 一次返回整个集合；工作台任务量大时需分页/增量同步（二期随实体化解决）。他人修改靠 30s 轮询，WS 推送待接。
- **PGlite 证据边界**：本机证据来自 `prisma dev`（PGlite，单连接，需 `pgbouncer=true`），非 PG16 官方镜像；备份恢复演练（pg_dump/pg_restore）本机无工具，仍待 CI migration job 首次实跑。
- **依赖审计余项**：10 high 为 apps/mobile Expo/RN 工具链（brace-expansion/braces/js-yaml/node-forge/source-map-js）与 prisma CLI 的 deepmerge-ts（需 Prisma 7）；CI 门槛暂为 critical。
- **未提交**：本机 `.git` 的 `main` 仍为 `335a787`（2026-10-02），索引 392 条；R1–R8 全部改动（含本节）在工作区未提交，本机无 git。

### R8-8 D-07 二期：工作台审批规则服务端化 + 假身份清零（2026-10-18）

> 用户拍板方案：「服务端审批命令 + 写入守卫」（数据仍在 `workspace_items`，不改数据结构）。目标：堵住一期遗留的「同租户成员经 API 直接写审批结果」信任缺口，并统一原前端四处各自实现、语义不一致的审核逻辑。

#### 已完成代码项

- [x] **共享规则包 `packages/workspace-rules`**（纯函数、零依赖）：`checkTaskUpsert/checkTaskDelete` 写入守卫 + `applyTaskReview` 审核命令。服务端用 dist（CommonJS）；web 经 Vite/TS 路径别名直接用源码，mock 演示模式在浏览器执行同一份规则，两边行为一致。
- [x] **写入守卫**（`PUT /workspace/tasks` 逐条 before→after，40301 带任务键）：所有角色——审核留痕只能由命令追加、创建人不可改、执行记录/评论只能追加且作者为本人、待审事项不能经批量写结束、禁止整值写入绕过逐条校验、条目键须等于 id；非管理——不能写出 approved/rejected 与提报通过、普通任务/项目不能直接完成（评审任务/个人计划除外）、承接人只能领取或退回（提交待审/评审/计划除外）、新建创建人须为本人（重复任务后续实例按同组创建人放行）、删除仅限本人草稿/个人计划/待审新提报。规则逐条对照现有前端流程制定（执行页状态切换本就不提供「已完成」，删除本就走 pendingDelete 审核）。
- [x] **审核命令 `POST /workspace/tasks/:taskId/review`**（approve/reject 仅 owner/admin，withdraw 限提报人或管理）：单事务执行全部副作用——完成闭环（需评审未通过拒绝，40902）+ SOP 沉淀到 sops 集合（同来源去重、兼容整值/条目两种存储）、内容/调整时间/承接人生效、删除申请级联删子孙 + 父级 SOP 移除同名步骤 + 顺序表同步、项目提报按 SOP 生成项目内任务置顶；驳回/撤回清理对应待审内容；审核留痕操作人 id/显示名取自令牌与库；整命令一条审计 `workspace.task.<action>`。合并了 AuditPage / 工作台审核收口 / 执行页审核区三处原实现（此前执行页审核不写留痕、驳回清理口径三处不一）。
- [x] **通讯录 `GET /workspace/directory`**：本租户有租户级角色的启用用户（id/显示名/头像/角色，管理排前），全员可读——成员无 `/users` 权限，但工作台要显示名与承接人候选。
- [x] **前端**：`useTaskReview`（真实模式经 `runWorkspaceCommand` 先等本地未完成提交落库、执行命令、再重拉 tasks/sops；失败弹服务端原因并保留弹窗）；AuditPage / 工作台 `resolveApproval` / 执行页内容·完成·承接人审核全部改走命令；`useMe`/`useDirectory`/`lookupMemberName`/`getCurrentUser` 取代 **24 个文件 155 处 `mockMe`/`mockUsers`**（`useUsers` 的 mock 回退保留）；评审任务默认承接人由硬编码 `user-001` 改为通讯录第一位管理；`useWorkspaceState` 40301 提示显示守卫原因；评估页对待审任务的直接指派前置拦截提示。
- [x] **构建**：根脚本 `build:packages`；CI 4 个 job 与 `services/api/dockerfile` 改为先构建全部共享包（此前 Docker 镜像同样缺 domain-events 构建步骤，api 编译必挂）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-18 | `pnpm --filter "./packages/workspace-rules" run build` | PASS |
| 2026-10-18 | api 单测：`workspace.service.spec.ts`（+6 守卫/命令）、`test/workspace-rules.spec.ts`（14 例纯规则） | PASS：api 43 suites / 422 tests |
| 2026-10-18 | `test:e2e`（本机 `prisma dev` 真实库）：W-06 成员写审批结果被拒且不落库、W-07 命令通过（完成/留痕显示名取库/SOP 沉淀/命令审计）、W-08 通讯录（管理排前、跨租户不可见） | PASS：3 files / 19 tests，无 skip |
| 2026-10-18 | web：`useTaskReview.test.tsx`（命令调用/失败提示/结果合并） | PASS：7 files / 67 tests |
| 2026-10-18 | `pnpm run lint` / `pnpm run build` / `openapi:check` | PASS |
| 2026-10-18 | 覆盖率：api 27.00/28.00/25.74/27.06（阈值上调 26/27/25/26）；web 5.39/5.2/4.36/5.38（阈值上调 5/5/4/5） | PASS |

#### 当前阻塞

- **浏览器端到端未验证**：审核中心/执行页/工作台三处审核入口、守卫拒绝提示、通讯录显示名均只有单测与服务层真实库证据，真实浏览器点测待 Playwright（R8 待做）或人工验收。**→ 2026-10-18 已在 §R8-9 补齐主流程浏览器冒烟（管理审核通过 + 通讯录 2 人）；守卫拒绝提示与驳回路径仍待补。**
- **守卫粒度边界**：评审状态 `reviewStatus → passed` 仍可由成员写（评审人完成评审任务的正常流程需要），它只是管理审批完成的前置门槛；排期/描述等非审批字段不设限（与一期一致）。
- **其他 mock 演示数据**：`mockProjects`/`mockTasks` 仍被工作台页面用于演示种子与项目健康度列表（真实模式下项目健康度列表为演示项目），属 `USE_MOCK` 双分支收敛（R8 待做）范围。
- **OpenAPI 未覆盖工作台接口**：`/workspace/*` 不在契约切片内（现有切片仅人员域），契约化待补。**→ 2026-10-18 已在 §R8-9 补齐（新增 `workspace.yaml` 切片）。**

### R8-9 R8 收尾：OpenAPI `/workspace/*` 契约切片 + Playwright 主流程冒烟（2026-10-18）

> 用户本次拍板范围（顺序执行）：R8 收尾（契约切片 + 浏览器冒烟）→ 依赖审计门槛提到 high → R9 可观测性开工。

#### 已完成代码项

**契约切片（`x-requirements`：D-07-1 集合存储 / D-07-2 审核命令）**
- [x] 新增 `workspace.yaml` 切片，覆盖三条路由：`GET /workspace/{collection}`、`PUT /workspace/{collection}`（`D-07-1`）、`GET /workspace/directory` 与 `POST /workspace/tasks/{taskId}/review`（`D-07-2`）；三条路径同时纳入 `generate.ts HANDWRITEN_PATHS`。
- [x] **错误信封对齐真实运行时**：`ErrorBody` 原为「每个切片各写一份」，与 `AllExceptionsFilter` 实际输出不符。统一为扁平结构 `{code: integer, message, details（自由形态：`[]` 或对象）, traceId, requestId}`，5 字段全 `required`、`additionalProperties: false`、`code.minimum = 400`；5 个切片同步改版。
- [x] **状态码漂移修复**：契约把 auth 6 个 POST 与 users 状态开关 POST 声明为 `'200'`，而相应控制器未加 `@HttpCode`（Nest 默认 201）。以运行时为准将契约改为 `'201'`，**未修改运行时行为**。
- [x] 版本号统一：`ErrorBody` 改版 = `1.2.0`，状态码漂移修复 = `1.3.0`（5 切片现均为 `1.3.0`）；`assemble.ts` 强制各切片 `info.version` 一致，不一致即失败。
- [x] 快照重生成（`src/openapi/openapi.snapshot.json`，75872 字节）。

**Playwright 主流程冒烟（真实 UI × 真实 API）**
- [x] `qa-e2e/smoke.mjs`：用 `playwright-core` 驱动**本机已装 Chrome**（`executablePath`，不下载浏览器）；12 步主流程——注册租户（201）→ 代建成员（201）→ 成员首登 `mustChangePassword:true` → API 改密（201）→ 管理员 UI 登录落 `/workspace` → 发布任务/项目（落 `status=todo` / `assigneeId=null`）→ 成员 UI 承接（`in_progress`）→ 执行页提报完成（`approvalStatus=pending`/`approvalType=completion`）→ 管理审核 `通过` → `status=done && approvalStatus=approved && 审核留痕 1 条` → 通讯录 `items=2`。产物：`qa-e2e/smoke-evidence/{01..08}-*.png` + `report.json`（12 步全 `ok:true`）。
- [x] 根脚本 `pnpm smoke`；CI 头注说明需真实栈（Postgres + API + web），暂为本地/发布前手动门禁。
- [x] 冒烟过程修复两处**测试自身**缺陷：AntD 在两个 CJK 字符按钮间插入空格（`发 布`），断言统一改 `/字\s*字/`；新增 `waitForTask` 轮询服务端状态，消除「UI 写 / API 读」竞态（而非改产品代码）。

**顺带修复（阻塞性缺陷）**
- [x] **Redis 宕机导致全站请求挂死**：node-redis v4 默认 `reconnectStrategy` 无限重试，`client.connect()` 永不 settle；`RateLimitGuard` 是全局 `APP_GUARD`，于是每个请求（含 `/health`）都被挂住，文档中「Redis 宕机降级」实际不可达。修复：`redis.service.ts` 改为「有界重连 + 冷却窗口」（`REDIS_CONNECT_TIMEOUT_MS=2000` / `REDIS_CONNECT_MAX_RETRIES=2` / `REDIS_RETRY_COOLDOWN_MS=15000`，新增于 `.env.example`），失败后进入冷却并快速 reject，调用方走既定降级分支（限流进程内 Map / reminders DB 兜底扫描 / 队列禁用）。
- [x] `tests/qa/ci-gate.test.ts` 断言与 CI 实际调用对齐（原断言的 `pnpm test`、`tenant-isolation` 字面量已过时）；**改断言不改 CI**。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-18 | `pnpm --filter "./services/api" run openapi:check` | PASS：5 个切片 `version: 1.3.0` 一致，快照一致 |
| 2026-10-18 | api 契约测试 `src/openapi/contract.spec.ts` | PASS：21/21 |
| 2026-10-18 | `node --experimental-strip-types tests/qa/api-error-envelope.test.ts` | PASS：信封 ⇄ schema、`additionalProperties:false`、`code.minimum===400`、POST⇒201 约定 |
| 2026-10-18 | `pnpm smoke`（真实 Chrome × 真实 API + web dev） | PASS：12/12 步；证据 `qa-e2e/smoke-evidence/{01..08}-*.png` + `report.json` |
| 2026-10-18 | `node --experimental-strip-types tests/qa/ci-gate.test.ts` | PASS（重新对齐 CI 真实调用后） |
| 2026-10-18 | Redis 停机 + 8 次快速 `POST /auth/login`（本机 PGlite） | PASS：前 5 次 `401`，第 6 次起 `429` + 扁平信封 `{"code":42901,…}`（进程内降级限流仍生效，非挂死） |

#### 当前阻塞

- **多实例限流窗口一致性**：本机无 Redis/docker，仅验证了单实例降级路径（R4 DoD #1 的多实例部分仍待环境）。
- **冒烟栈未进 CI**：`pnpm smoke` 需 Postgres + API + web 三件套，CI 暂未承载（已记录于 `ci.yml` 头注）。
- **`/workspace/*` 契约与被测实现的一致性**：由静态契约测试与快照门禁保证，未做「契约驱动」的请求级校验（如 openapi-validator 中间件）。

### R8-10 依赖审计门槛提到 high（按可交付范围收敛）（2026-10-18）

#### 已完成代码项

- [x] **`scripts/audit-deployable.mjs`（新）**：`pnpm audit` 在子目录仍审整个 lockfile，故脚本按**可交付范围**（`services/api`、`apps/web`、`packages/*`）过滤，再按 `--audit-level high` 卡门槛；`apps/mobile`（Expo/RN 工具链，未进本仓库 build/deploy）显式列为**范围外接受风险**并打印清单，不阻断合并。
- [x] **依赖修复（overrides）**：根 `pnpm.overrides` 增补 `deepmerge-ts: ^8.0.2`（services/api 经 `@prisma/client > prisma > @prisma/config` 传递）与 `qs: ^6.16.0`；`pnpm install` 后 lockfile 解析为 `deepmerge-ts@8.0.2`、`qs@6.16.1`。
- [x] **CI audit job**：改为 `pnpm install --frozen-lockfile` + `node scripts/audit-deployable.mjs --audit-level high`（不再停留在 critical）。
- [x] `tests/qa/ci-gate.test.ts` 增补断言：审计必须走可交付范围脚本且门槛 high、不得为 critical；脚本须含 `services/api` / `apps/web` / `packages/` 且显式声明 `apps/mobile` 为范围外。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-18 | `node scripts/audit-deployable.mjs --audit-level high` | PASS：可交付范围 0 项 ≥ high；范围外 5 项 high（js-yaml / brace-expansion / node-forge / braces / source-map-js，均为 apps/mobile）记录为接受风险 |
| 2026-10-18 | `pnpm audit --prod`（overrides 前后） | 16 项（0 critical / 10 high / 6 moderate）→ 13 条公告；可交付范围内 ≥ high 归零 |
| 2026-10-18 | `pnpm --filter "./services/api" exec prisma validate` + `prisma generate`（deepmerge-ts 8 下） | PASS |
| 2026-10-18 | api 单测（overrides 后） | PASS：49 suites / 454 tests |

#### 当前阻塞

- **`apps/mobile` 残余 high**：修需升级 Expo/RN 工具链（`braces` / `node-forge` 等无 patched 版本）或加 overrides，本机无法验证移动端构建，故**不加空转 overrides**，列为接受风险。
- **无 CI 实跑**：本地 pnpm 版本与 CI 一致（`pnpm@9.15.5`），但 job 真跑待推送。

### R9-1 可观测性地基：结构化日志 + 请求溯源 + 慢查询 + `/metrics`（2026-10-18）

> 范围：`pino` 结构化日志（含凭据脱敏、框架日志接管）、访问日志携带 `requestId`、DB 慢查询日志与指标同源、Prometheus `/metrics` 端点。Sentry/告警通道不在本次范围（无 DSN，环境阻塞，已记录）。

#### 已完成代码项

**结构化日志（`src/common/observability/`）**
- [x] `observability-config.ts`：纯函数解析 `LOG_LEVEL`（默认 `info`，非法值回落）、`SLOW_QUERY_MS`（默认 `200`）、`METRICS_ENABLED`（默认 `true`，仅 `false`/`0`/`off` 关闭）、`APP_ENV`。
- [x] `pino-logger.ts`：`createPinoLogger(env, destination)`（可注入输出流便于单测）+ 进程级惰性单例 `obsLogger()`；`base = {service:'openschedule-api', env}`，ISO 时间戳，级别输出为标签；**脱敏** `REDACT_PATHS` 覆盖 `password/newPassword/currentPassword/passwordHash/token/accessToken/refreshToken/secret/apiKey`（含嵌套 `*.`）与 `req.headers.authorization`、`req.headers.cookie`（§3.3 凭据边界），替换为 `[REDACTED]`。
- [x] `AppLogger implements LoggerService`：Nest 级别映射（`verbose→trace`），`error(message, stack, context)` 约定处理（末位字符串作 context），`main.ts` 以 `bufferLogs: true` + `app.useLogger(app.get(AppLogger))` 接管框架日志（Bootstrap/路由映射/Nest 警告均落 JSON）。注入用显式 token `PINO_LOGGER`（`pino.Logger` 为类型，`emitDecoratorMetadata` 会产出 `Object` 而无法解析）。

**请求溯源访问日志 + RED 指标**
- [x] `http-observability.middleware.ts`：`process.hrtime.bigint()` 计时，`res.on('finish')` 与 `res.on('close')` 双事件去重收口（客户端中断也归还），产出 `{"event":"http_request", method, route, path, status, durationMs, requestId, tenantId, userId, ip}`；日志级别 5xx→`error` / 4xx→`warn` / 其余 `info`；`path` 仅记路径剔除查询串（查询串可能含回调 token）。`route` 取 `req.route.path ?? req.path` 并**归一化**（UUID/纯数字/复合 id 段 → `:id`）防标签基数爆炸。
- [x] `metrics.ts`：独立 `Registry`（避免测试串扰）+ 默认标签 `service="openschedule-api"`；`openschedule_http_requests_total{method,route,status}`、`openschedule_http_request_duration_seconds{...}`（直方图）、`openschedule_http_requests_in_flight`、`openschedule_db_slow_queries_total{model,operation}`、`openschedule_system_events_total{event}`；`initDefaultMetrics()` 幂等注册运行时默认指标（`prefix:'openschedule_'`）。使用 `@prometheus-io/client@0.16.1`（`prom-client` 已更名为该官方后继包）。

**慢查询（日志与指标同源）**
- [x] `src/common/prisma/slow-query.extension.ts`：`runWithSlowQueryLogging` 用 `hrtime` 计时，超 `SLOW_QUERY_MS`（默认 200）时记 `{"event":"db_slow_query", model, operation, durationMs, thresholdMs}` 结构化日志**并**递增 `openschedule_db_slow_queries_total`；查询异常在 `finally` 中同样计时（慢且失败可观测），异常原样抛出。`prisma.service.ts` 链式组合 `$extends(tenantFilterExtension).$extends(slowQueryExtension)`。

**`/metrics` 端点**
- [x] `metrics.controller.ts`：`@Public()`（部署侧抓取器不带 JWT）+ `@Controller('metrics')`，`main.ts` 的 `setGlobalPrefix` `exclude` 增 `'metrics'`（实际路径 `/metrics`，无 `/api/v1` 前缀）；`Cache-Control: no-store`；`METRICS_ENABLED=false` 时抛 `NotFoundException`（404 + 统一错误信封）。启动时调用 `initDefaultMetrics()`。
- [x] `common.module.ts`：注册 `{provide: PINO_LOGGER, useFactory: () => obsLogger()}`、`AppLogger`、`MetricsController`；中间件顺序 `RequestIdMiddleware → HttpObservabilityMiddleware → SecurityHeadersMiddleware → TenantFilterMiddleware`（访问日志需 `requestId` 已就绪）。
- [x] 系统级事件指标**不是死代码**：`RedisService` 进入降级冷却时上抬 `openschedule_system_events_total{event="redis_degraded"}`（每次冷却窗口至多一次，窗口内不重连故不会刷爆），把「Redis 宕机」从日志文本变成可告警的指标信号。
- [x] **配置面贯通**：根 `.env.example` 第 14 组（`deploy/docker-compose.yml` 的 `env_file` 真正来源）同步 `SLOW_QUERY_MS` / `METRICS_ENABLED`，否则根 `.env` 里配了也进不了容器；`services/api/.env.example` 同步。
- [x] `.env.example` 增补 `SLOW_QUERY_MS`、`METRICS_ENABLED`（`LOG_LEVEL`、`SENTRY_DSN` 原已存在）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-18 | `pnpm --filter "./services/api" run test:cov`（Redis 降级上报语句加入前） | PASS：49 suites / 454 tests；覆盖 **28.17 / 29.07 / 27.44 / 28.25**（statements/branches/functions/lines），阈值由 26/27/25/26 **上调**为 27/28/26/27 |
| 2026-10-18 | 新增单测 6 文件（config / pino-logger / metrics / metrics.controller / http-observability.middleware / slow-query.extension）+32 例 | PASS |
| 2026-10-18 | `node --experimental-strip-types tests/qa/observability-gates.test.ts`（新门禁） | PASS：日志/溯源/慢查询/指标四类源码契约 + 根/服务两份 `.env.example` 同步 + `recordSystemEvent('redis_degraded')` 必须被调用 |
| 2026-10-18 | api `test:cov`（新增 Redis 降级上报语句后复跑） | PASS：28.17 / 29.06 / 27.44 / 28.25（阈值 27/28/26/27） |
| 2026-10-18 | `pnpm run lint`（api+web typecheck）/ `pnpm run build` | PASS |
| 2026-10-18 | 全部既有门禁重跑（`tests/qa/*` 7 个 + `tests/security/*` 5 个） | PASS |
| 2026-10-18 | `node dist/main.js`（本机 PGlite 真实库，`LOG_LEVEL=info` `SLOW_QUERY_MS=50` `METRICS_ENABLED=true`） | 启动日志全部为 pino JSON：`{"level":"info",…,"context":"RouterExplorer","msg":"Mapped {/metrics, GET} route"}`、`…"context":"Bootstrap","msg":"OpenSchedule API 已启动…"` |
| 2026-10-18 | `curl /metrics` | **200** `text/plain; charset=utf-8; version=0.0.4`，**123 条** `openschedule_*` 序列（含 `process_*` / `nodejs_*` 运行时默认指标、`http_requests_total{method,route,status}`、`http_requests_in_flight`、`db_slow_queries_total`） |
| 2026-10-18 | `curl /health` | **200** `{"status":"ok","service":"openschedule-api","db":"up",…}` |
| 2026-10-18 | `curl -H "X-Request-Id: r9-live-evidence-1" /health` | 响应头 `X-Request-Id: r9-live-evidence-1`；日志 `{"event":"http_request","method":"GET","route":"/health","status":200,"durationMs":2042.17,"requestId":"r9-live-evidence-1",…}` |
| 2026-10-18 | 访问日志路由标签（Nest 模板，含前缀） | `/health`、`/metrics`、`POST /api/v1/auth/login`（401/429 → `level:"warn"`） |
| 2026-10-18 | 强制慢查询（`SLOW_QUERY_MS=50`） | 日志 `{"event":"db_slow_query","model":"Role","operation":"findFirst","durationMs":2088.32,"thresholdMs":50}`；指标 `openschedule_db_slow_queries_total{model="Role",operation="findFirst"} 1`（另 `NotificationDelivery.findMany` 55.49ms） |
| 2026-10-18 | `METRICS_ENABLED=false` 另起实例（:3007） | `/metrics` → **404** + 统一信封 `{"code":40401,"message":"指标端点已关闭（METRICS_ENABLED=false）","details":[],"traceId":…,"requestId":…}`；`/health` 仍 200 |
| 2026-10-18 | Redis 停机下的降级（同批） | 限流进程内生效（5×401 → 42901）；`RemindersWorker` 记 `Redis zset 队列不可用，降级 DB 扫描`（请求不再挂死）；`/metrics` 出现 `openschedule_system_events_total{event="redis_degraded"} 1`（`RedisService` 09:38:29 进入冷却 → 降级事件真实上报） |

#### 当前阻塞

- **Sentry / 告警通道未接入**：无 `SENTRY_DSN`，`recordSystemEvent` 仅暴露计数；告警规则（Prometheus Alertmanager 或等价）与指标看板未建。属环境/基础设施阻塞。
- **链路追踪无 collector**：`traceId`/`requestId` 已透传并进日志，但未接 OpenTelemetry/Jaeger 等，跨服务（api ↔ ai）关联仅靠 `requestId` 头。
- **`/metrics` 未加访问白名单**：`@Public()` 为端点语义所需（抓取器无 JWT）；生产应由网络层/反向代理限制来源，当前代码层未做来源限制。
- **本地证据边界**：来自 `node dist/main.js` + PGlite（`prisma dev`），非容器/Prometheus 真实抓取；`pnpm smoke` 与 `/metrics` 抓取均未进 CI。

### R9-2 告警规则 + Grafana 看板 + Sentry 5xx 上报（2026-10-18）

> 承接 R9-1（指标已暴露但无规则/看板/上报通道）。本批只消费 R9-1 已实测的 `openschedule_*` 指标，不新增指标。

#### 已完成代码项

**Prometheus 抓取与告警规则**
- [x] `deploy/observability/prometheus.yml`：job `openschedule-api` 抓取 `api:3000/metrics`（15s），`rule_files` 加载 `alerts.yml`。
- [x] `deploy/observability/alerts.yml`：8 条规则，每条带 `severity` + `summary/description`——
  `ApiDown`（`up{job="openschedule-api"} == 0` 1m，critical，同时兜住 `/metrics` 被 `METRICS_ENABLED=false` 关闭的情况）、
  `ApiHighErrorRate`（5xx/总请求 > 5%，5m，critical）、
  `ApiHighLatencyP95`（`histogram_quantile(0.95, …)` > 1s，5m，warning）、
  `ApiInFlightSaturation`（在途 > 200，5m，warning）、
  `DbSlowQuerySpike`（慢查询速率 > 0.2/s，10m，warning）、
  `RedisDegraded`（15m 内出现 `system_events_total{event="redis_degraded"}`，critical）、
  `ApiEventLoopLagHigh`（事件循环 p99 > 0.5s，5m，warning）、
  `ApiHeapUsedHigh`（堆使用率 > 90%，10m，warning）。

**Grafana 看板（自动 provision）**
- [x] `deploy/observability/grafana/provisioning/datasources/prometheus.yml`：数据源固定 `uid: openschedule-prometheus`（供看板引用），指向 `http://prometheus:9090`。
- [x] `deploy/observability/grafana/provisioning/dashboards/dashboards.yml`：文件型 provider，目录 `/var/lib/grafana/dashboards`。
- [x] `deploy/observability/grafana/dashboards/openschedule-api.json`：8 个面板（请求速率按路由、5xx 比例带阈值配色、在途请求带阈值、p50/p95/p99 延迟、慢查询按 model/operation、系统事件 1h 增量、事件循环 p50/p99、堆 used/total）。

**观测性栈接入 compose（默认不启动）**
- [x] `deploy/docker-compose.yml` 增 `prometheus`（`prom/prometheus:v2.54.1`，9090）与 `grafana`（`grafana/grafana:11.2.0`，3001→3000），均挂 `profiles: ["observability"]`，避免 `docker:up` 默认拉起；挂载 `prometheus.yml`/`alerts.yml`/Grafana provisioning 与看板目录；新增数据卷 `promdata`/`grafanadata`。
- [x] api 服务显式透传 `METRICS_ENABLED: ${METRICS_ENABLED:-true}`（原先只靠根 `.env` 隐式继承）。
- [x] 根脚本 `pnpm docker:obs`；`deploy/readme.md` 增「可观测性栈（R9）」段（指标表、告警清单、用法、Sentry 说明）；服务清单表补两行。
- [x] 根 `.env.example` 第 14 组补 `SENTRY_RELEASE` / `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`；`services/api/.env.example` 写明 Sentry 上报范围与脱敏行为。

**错误上报（Sentry Envelope 直连，零依赖）**
- [x] `services/api/src/common/observability/sentry.ts`：`parseSentryDsn`（公钥/项目号/envelope 地址）、`resolveSentryOptions`（无 DSN → null）、`scrubMessage`、`parseStackFrames`（V8 → Sentry frames，`in_app` 区分业务/依赖）、`buildSentryEvent`、`buildEnvelope`、`initSentry`、`captureException`。
- [x] 行为：`SENTRY_DSN` 为空 → **完全 no-op**（不注册、不发请求）；有 DSN → 5xx 以 Envelope `POST {dsn}/api/{project}/envelope/`（`X-Sentry-Auth: Sentry sentry_version=7, sentry_client=…, sentry_key=…`），事件含 `exception.values[0]{type,value,stacktrace.frames}` + 白名单标签 `request_id/trace_id/http_method/route/http_status`，**不带请求体/请求头**；消息先脱敏（Bearer / JWT / `password=` / `api_key=` / ≥32 位十六进制）；每 60s 窗口上限 20 条；3s 超时；任何失败静默不影响业务。
- [x] 接入：`main.ts` 在 `NestFactory.create` 前 `initSentry(process.env)`，启动日志声明启用状态；`AllExceptionsFilter` 仅在 **5xx** 调 `captureException`（4xx 业务错误不上报，避免噪声与配额浪费）。
- [x] **为什么是零依赖实现（决策记录，三者均实测）**：`@sentry/node@11` 经 `@sentry/bundler-plugins → webpack → ajv` 引入 `fast-uri` + `brace-expansion` 两条 **high**（门禁直接 FAIL）；`@sentry/node@^8` 审计虽 PASS(high)，但连带 `@opentelemetry/instrumentation-*`（pg/mysql/mongo/knex/tedious…）新增 8 条可交付范围 **moderate**，且与「不接 OTel collector」的既定决策冲突、对 Prisma 应用毫无价值；`@sentry/core@11` 已不再导出 `init`，`@sentry/node-core@10` 缺 `@opentelemetry/instrumentation` peer 连 `require` 都失败。故实现 Sentry 官方公开的 Envelope 协议，接口（`initSentry`/`isSentryEnabled`/`captureException`）与官方 SDK 同形，**后续官方提供无 OTel 轻量包时只替换该文件**。门禁 `observability-gates` 断言「不得依赖 `@sentry/*`」以固化此决策（若改回官方 SDK，需同步改门禁并接受相应审计公告）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-18 | `pnpm --filter "./services/api" add @sentry/node`（v11.8.0） | FAIL 审计：`fast-uri`(high, GHSA-5jgf-p345-68v8) + `brace-expansion`(high, GHSA-qhr7-859c-m2p7)，路径 `@sentry/node → @sentry/bundler-plugins → webpack → ajv/glob` |
| 2026-10-18 | `add @sentry/node@^8`（8.55.2） | 审计 PASS(high)，但可交付范围新增 8 条 moderate（`@opentelemetry/core` 及 instrumentation-pg/mysql/mysql2/mongoose/knex/tedious）→ 放弃 |
| 2026-10-18 | `add @sentry/core@^11` / `@sentry/core@^8` / `@sentry/node-core@10` | 均不可用：core 无 `init`；node-core `Cannot find module '@opentelemetry/instrumentation'` → 放弃 |
| 2026-10-18 | 最终实现（无任何 `@sentry/*` 依赖） | `node scripts/audit-deployable.mjs --audit-level high` **PASS**（13 条公告、841 条路径；范围外仍为 apps/mobile 5 项 high） |
| 2026-10-18 | `pnpm exec vitest run src/common/observability/sentry.spec.ts` | PASS：18/18（DSN 解析 4 例、配置回落 2、脱敏 2、栈解析 3、事件/信封 3、上报与限流 4） |
| 2026-10-18 | `yaml` 包解析 5 个部署 YAML + dashboard JSON | PASS：全部可解析；alerts 8 条规则 `expr/labels.severity/annotations` 齐备；dashboard 8 panels |
| 2026-10-18 | `node --experimental-strip-types tests/qa/observability-gates.test.ts` | PASS（新增：Sentry 走 Envelope + X-Sentry-Auth + 脱敏 + 栈帧 + 限流；`@sentry/*` 依赖为空；8 条告警点名到点；compose profile/挂载/卷/脚本/readme） |
| 2026-10-18 | 启动日志（`SENTRY_DSN=http://abc123def456@127.0.0.1:4321/42`，本机接收器） | `{"level":"info",…,"context":"Bootstrap","msg":"错误上报（Sentry）：已启用（SENTRY_DSN 已配置）"}` |
| 2026-10-18 | 真实 500 ×3（`GET /api/v1/tasks/<非UUID>`、`/projects/<非UUID>`、`/users/<非UUID>`） | 3 个 5xx 统一信封（`code:50000`，`requestId` 各自独立）；本机接收器收到 **3** 条 Envelope：`POST /api/42/envelope/`、`X-Sentry-Auth: Sentry sentry_version=7, sentry_client=openschedule-api/1.0, sentry_key=abc123def456`、`content-type: application/x-sentry-envelope` |
| 2026-10-18 | Envelope 事件内容核对 | `PrismaClientKnownRequestError` + **真实 V8 栈**（`tasks.service.js` `TasksService.loadTaskOr404` line 534 col 22、`in_app:true`，共 6 帧；users 路由 10 帧）+ 标签 `request_id`/`trace_id`/`route=/api/v1/tasks/:id`/`http_status=500` |
| 2026-10-18 | 同请求四方一致（可观测性闭环） | 500 响应 `requestId=020533bc-…` == 访问日志（`level:"error"`、`route` 归一化、`tenantId`/`userId` 齐备、`durationMs`）== `ExceptionFilter` error 日志 == Sentry 事件 `tags.request_id`；`trace_id` 同源 |
| 2026-10-18 | 4xx 不上报 | `GET /workspace/tasks/<非UUID>/review`（POST-only 路由）→ 404 统一信封；接收器总计仍为 **3** 条（4xx 未上报，符合设计） |
| 2026-10-18 | `pnpm --filter "./services/api" run test:cov` | PASS：50 suites / 472 tests；覆盖 **29.09 / 30.18 / 28.08 / 29.15**，阈值由 27/28/26/27 上调为 **28/29/27/28** |
| 2026-10-18 | `pnpm run lint`（api+web typecheck）/ `pnpm run build` | PASS |
| 2026-10-18 | 全部既有门禁重跑（`tests/qa/*` 8 个 + `tests/security/*` 4 个） | PASS |

#### 当前阻塞

- **观测性栈未实跑**：本机无 Docker，compose profile 与 Prometheus/Grafana 容器未实际启动；YAML/JSON 仅做语法与结构校验，PromQL 的真实求值待有 Prometheus 的环境（表达式均为标准函数，且引用的指标名与 R9-1 实测序列逐一对应）。
- **Alertmanager / 通知通道未接入**：「规则」已有，「通知」（邮件/IM/短信）待基础设施；当前规则仅处于 firing 状态（Prometheus UI → Alerts 可见）。
- **Sentry 未对真实服务验证**：本机接收器证明了 Envelope 协议、鉴权头、事件结构与脱敏正确；对真实 DSN 的端到端（含 Sentry 侧符号化/配额）待有 DSN 的环境。
- **`/metrics` 抓取与冒烟仍未进 CI**：`pnpm smoke`、`docker:obs` 均为本地/发布前手动门禁。

### R9-3 web / AI 两端错误上报 + Alertmanager 告警通知通道（2026-10-21）

> 关闭 §R9-2 两项阻塞中的代码部分：「web/ai 端 Sentry 未接」「Alertmanager / 通知通道未接入」。go-no-go §4.1 #6 的剩余项只剩真实 DSN 与 staging 实触发。

#### 已完成代码项

- [x] **web**：`apps/web/src/lib/errorReporting.ts`（Envelope 直连，零依赖；查询串鉴权 + `text/plain` = 无 CORS 预检；`keepalive`、`credentials: 'omit'`）。捕获 `window.error` / `unhandledrejection` / React 19 `onCaughtError` + `onUncaughtError`；凭据脱敏、URL 去查询串、每分钟 10 条 + 同消息 60s 去重、整栈来自浏览器扩展即丢弃、跨域 `Script error.` 忽略。
- [x] **web 运行时配置**：DSN 不在构建期烘焙——`deploy/web/40-runtime-config.sh`（nginx `/docker-entrypoint.d/`）按 `WEB_SENTRY_DSN`/`APP_ENV`/`SENTRY_RELEASE` 生成 `/runtime-config.js`，`index.html` 先于入口加载、nginx 对其 `no-cache`；同一不可变镜像跨 staging/prod 复用。`apps/web/public/runtime-config.js` 为本地空默认。
- [x] **ai**：`services/ai/app/services/sentry.py`（复用 httpx，零新依赖）；DSN `AI_SENTRY_DSN` 优先、回落 `SENTRY_DSN`（`AliasChoices`）；全局 `exception_handler(Exception)` → 统一 500 信封 + 上报（HTTPException/4xx 不经此处）；拆解后台任务仅 `AI_INTERNAL_ERROR` 上报（LLM 超时/限流/鉴权走 ai.error + 指标）。脱敏额外覆盖 `sk-*` 模型密钥，不含提示词/模型输出。
- [x] **告警通知**：`deploy/observability/alertmanager.yml`（按 `alertname+service` 分组，critical 1h / warning 4h 重复，`ApiDown` 抑制同服务其它告警）+ `prometheus.yml` `alerting:` → `alertmanager:9093`；`deploy/observability/alert-bridge/server.mjs`（零依赖 Node）把 Alertmanager v4 payload 渲染为中文文本，并发投递飞书（签名）/ 钉钉（加签）/ 企业微信 / 通用 webhook，识别「HTTP 200 内业务失败」，任一失败返回 502 交给 Alertmanager 重试；机器人地址只在 `ALERT_*` 环境变量。
- [x] compose：dev 与 prod 均加 `alertmanager` + `alert-bridge`（profile=observability，prod 带 restart/资源上限/日志轮转/健康检查）；prod `web` 注入 `WEB_SENTRY_DSN`；`docker:obs` 一并拉起；env 模板（根 / `deploy/.env.production.example` / `services/ai/.env.example`）补齐；`.gitattributes` 固定 `*.sh eol=lf`。
- [x] 门禁：`tests/qa/observability-gates.test.ts` 新增 §8（web/ai 上报契约）与 §9（告警通知链路契约）。runbook §4/§6/§8、go-no-go #6 同步。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-21 | `pnpm --filter "./apps/web" exec vitest run src/lib/errorReporting.test.ts` | PASS：22 例（DSN 解析/运行时优先/脱敏/双栈格式/限流/去重/扩展噪声/全局监听） |
| 2026-10-21 | `pnpm --filter "./apps/web" run typecheck` / `test:cov` / `build` | PASS：8 files / **89 tests**（原 67），覆盖率门槛通过；`dist/runtime-config.js` 产出且 `index.html` 引用 |
| 2026-10-21 | `cd services/ai && uv run pytest -q` | PASS：**174 passed, 1 skipped**（新增 `test_sentry.py` 10 例：500 处理器上报且 4xx 不报、DSN 别名优先级、限流、传输失败静默） |
| 2026-10-21 | `uv run ruff check`（本次改动文件） | PASS |
| 2026-10-21 | `node --test deploy/observability/alert-bridge/server.test.mjs` | PASS：11 例，含真实 HTTP 端到端（假机器人收到三通道消息、飞书/钉钉签名与官方算法一致、业务失败 → 502、不可达 → 502） |
| 2026-10-21 | `tests/qa/{observability,deploy-prod,ai-hardening,load-and-seed}-gates.test.ts` | PASS |

#### 当前阻塞

- 真实 DSN（三端）与真实群机器人投递未验证；`amtool check-config` 与 Alertmanager 实跑需 Docker 环境。
- `40-runtime-config.sh` 仅静态审查（本机无 sh/nginx 容器），首次镜像构建时验证。

### R9-4 D-14 团队 AI 模型配置：管理员统一配置 key、去 LiteLLM、AI 全链路接通（2026-10-21）

> 用户需求「LLM key 部署后由用户在前端配置」→ 拍板 D-14：**租户管理员统一配置，全团队共用；去掉 LiteLLM，AI 服务直连厂商**。
> 开工前核查发现：此前产品里**没有任何路径真正调用大模型**——`/proposals/decompose` 是主服务确定性规则引擎、从未调用 AI 服务；Python AI 服务无调用方；AI 规则页/智能协助在浏览器直连构建期写死的 `VITE_AI_AGENT_ENDPOINT`。本批把三条链路一并接通。

#### 已完成代码项

- [x] **数据**：`tenant_llm_configs`（每租户一行，主键 = tenant_id，FK 级联；provider/base_url/model/api_key 密文/api_key_key_version/api_key_last4/updated_by），迁移 `20261021100000_tenant_llm_configs`；加入 `TENANT_SCOPED_MODELS`。
- [x] **主服务 `modules/llm`**：厂商预设（DeepSeek / 智谱 GLM / 通义千问 / Kimi / OpenAI / 自定义 OpenAI 兼容）；`GET/PUT/DELETE /settings/llm`（仅 tenant.owner/admin，key 留空 = 保留原 key，首次必填）、`POST /settings/llm/test`（缺省项回落已存配置，失败 200 + ok=false 中文原因，10 次/分钟）、`GET /settings/llm/providers`、`GET /ai/status`（全员，无 key 信息）、`POST /ai/complete`（全员，未配置 40910，上游失败 502，30 次/分钟）。key 经 `CredentialCipher` AES-256-GCM 落库，响应/审计（`llm_config.update/delete`）只出末 4 位；base_url 保存前与每次调用前过 SSRF 守卫，出站 `redirect: 'error'`；错误消息不回显 key 与上游响应体。新错误码 `AI_NOT_CONFIGURED = 40910`。
- [x] **项目拆解接通 AI 服务**：`proposals/ai-gateway.client.ts`（`POST /ai/decompose` + SSE 消费到 ai.done/ai.error，服务 token + `X-Proposal-Id`，`AI_DECOMPOSE_TIMEOUT_MS` 默认 90s）；非模板模式且租户已配置 → AI 拆解，结果经 `toInternalDecompose` 转为草稿格式（snake→camel、deps 平铺为 fromIndex→toIndex、坏依赖丢弃）并重新 CPM 排期；**失败不抛**，保留规则引擎草稿并在 warnings 写明原因。回调 `/internal/ai/results` 与同步流共用 `applyAiResult`（按 run_id 幂等），**顺带修复回调把 AI 原始 snake_case payload 直接合并进草稿、导致 apply 读不到 estimatedHours/依赖的潜在缺陷**。草稿新增 `engine: ai|rules` 与 `aiModel`。
- [x] **AI 服务去 LiteLLM**：`DecomposeRequest.llm: LlmTarget | None`（base_url/api_key[SecretStr]/model，`exclude=True` → model_dump/存储/回调永不带出）；图状态以对象直传；`LLMClient(settings, target)` 用租户端点与模型，`target=None` → 模板降级；删除 `LITELLM_URL/LITELLM_API_KEY/LLM_DEFAULT_MODEL/LLM_PLANNING_MODEL`；真实采样 eval 改用 `EVAL_LLM_API_KEY/EVAL_LLM_BASE_URL/EVAL_LLM_MODEL`。
- [x] **前端**：设置页新增首个 Tab「AI 模型」（`components/settings/LlmSettingsTab.tsx`：管理员表单 + 测试连接 + 清除；成员只读状态）；`api/llmApi.ts`（mock 模式经 `mockOrValue` 收敛）；`hooks/useAiStatus`；`utils/aiRules.callAgent` 改经后端 `/ai/complete`（未接入即抛错 → 调用方回落本地规则），删除 `VITE_AI_AGENT_ENDPOINT`；AI 规则页/智能协助/提示词与 Skill 生成的状态文案改为团队配置口径；拆解面板显示「AI 模型生成 · 模型名 / 规则引擎」标签；拆解请求超时放宽到 120s、生成 75s、测试连接 30s。
- [x] **部署**：prod compose 删除 `litellm` 服务与 `LITELLM_MASTER_KEY`/厂商 key 变量，删除 `deploy/litellm/`；env 模板、drill 必填变量、runbook（拓扑/密钥清单/容量 + AI 模型配置与 `ENCRYPTION_KEY` 轮换影响）、readme 同步；`deploy-prod-gates` §5 改为「部署配置零模型 key + key 加密 + SSRF + AI 不序列化」。
- [x] **契约与决策**：OpenAPI 新切片 `src/openapi/llm.yaml`（6 个操作）并 `openapi:sync`；ADR 表 D-14、OPEN-DECISIONS 登记 D-14 与 D-02/D-08 再确认（不用 Railway，云服务器 compose）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-21 | 本机真实 PostgreSQL（`prisma dev`）：`migrate deploy` / `migrate status` / `migrate diff --exit-code` | PASS：8 个迁移，库⇄schema **零漂移** |
| 2026-10-21 | 真实库冒烟脚本（upsert 两次 / 外键拒绝 / 删租户级联） | PASS：`SMOKE_OK` |
| 2026-10-21 | `pnpm --filter "./services/api" run test:e2e`（真实库） | PASS：3 files / 19 tests |
| 2026-10-21 | `pnpm --filter "./services/api" run test` / `typecheck` | PASS：**54 files / 501 tests**（新增 llm-client、llm-config.service、ai-gateway.client、proposals.ai 共 4 个 spec） |
| 2026-10-21 | `pnpm --filter "./services/api" run openapi:check` | PASS（新增 llm 切片后已 sync） |
| 2026-10-21 | `cd services/ai && uv run pytest -q` | PASS：**179 passed, 1 skipped**（含租户 LlmTarget 经 JSON 体 strict 解析透传、SSE/回调不回显 key） |
| 2026-10-21 | `pnpm --filter "./apps/web" run typecheck` / `test:cov` / `build` | PASS：10 files / **98 tests**，覆盖率门槛通过 |
| 2026-10-21 | `tests/qa/*` + `tests/security/*` + `tests/authz/*` 全量 | PASS（`deploy-prod-gates` 已改为 D-14 口径；`web-mock-convergence` 通过） |

#### 当前阻塞

- **真实厂商调用未验证**：所有模型调用均为假 fetch/假 SSE；需管理员填一把真实 key 后在 staging 走一次「测试连接 → 项目拆解 → AI 规则生成」。
- 失去 LiteLLM 后**没有网关级统一限流/计费**：单次预算护栏留在 AI 服务，月度用量仍为进程内估算（TODO：按租户持久化用量）。
- 自定义地址的 SSRF 校验在主服务；AI 服务出站前不重复 DNS 校验（仅管理员可配置，风险已接受并记录）。
- 移动端尚未接入 AI 状态/拆解标签（随 APP 真实 API 对接一起做）。

### R8-11 `USE_MOCK` 双分支彻底收敛（请求层单点判定）（2026-10-18）

> 用户本次拍板范围（顺序执行）：R9 收尾 → **R8 剩余（`USE_MOCK` 双分支收敛 + decompose schema eval）** → R10 生产部署与运维开工。

#### 已完成代码项

**收敛设计：单点判定而非逐函数改写**
- [x] 新增 `apps/web/src/api/mock/dispatch.ts`（76 行）为**唯一** mock 判定点，导出 4 个收敛入口：
  - `mockOr(handler, real, ...args)`：有对应 mock 处理器时走 mock（`handler` 由 `MockHandlerName = keyof MockHandlers` 约束，**拼错/删处理器即 typecheck 失败**）；
  - `mockOrValue(real, local)`：无处理器、仅返回固定结构（如 `{id, deleted:true}`）；
  - `mockOrMap(handler, map, real, ...args)`：mock 结果需本地二次加工（如 `{...mockGetDashboard(id), projectId}`）；
  - `mockOrVoid(real, local)`：无返回值的副作用函数（如 `exportCsv` 的浏览器下载）。
- [x] 该文件只 import `USE_MOCK`（来自 `../config`）与 `getMockHandlers`（来自 `./loader`）；**其余 21 个 api 模块不再 import 二者**。
- [x] 方案取舍：曾评估「axios 适配器 / URL→路由表」替代方案，因体量（87 处分支、2334 行 fixtures）与出错面过大而否决；选择在同一文件内收敛判定，保留 mock 层按需 dynamic-import（R7-5 的产物隔离不退化）。

**改写与结果**
- [x] 改写前整目录备份（`apps/web/src/api` 24 文件），以一次性 codemod 完成批量改写，未命中/形态特殊者（`as any`、`{...mockX(), ...input}`、多行 mock 分支、副作用分支）**逐个人工改写**，不牺牲 mock 语义（如 `updateRule` 改为 fixtures 既有 `mockUpdateRule`、`toggleRule` 改 `mockToggleRule`）。
- [x] 结果：`apps/web/src/api/**` 请求层 **`USE_MOCK` 出现 0 处**（仅 `config.ts` 定义、`mock/` 目录内判定）；`mockOr(` 90 处 + `mockOrValue(`/`mockOrMap(`/`mockOrVoid(` 各 2 处覆盖 21 个模块、115 个导出函数的全部分支。
- [x] 顺带修正 codemod 引入的两类 typecheck 破损（12 个模块残留未用 `USE_MOCK` import；5 个模块被误删 `getMockHandlers` import），均已消解，**最终 `tsc` 干净**。

**范围界定（诚实记录，非遗漏）**：UI 层仍保留 14 个文件、41 处 `USE_MOCK`，其性质是**开发期界面降级/播种**（登录页演示提示、通知/MCP 通道演示文案、hooks 本地种子数据），不是**请求层双分支**；且它们仍统一读取 `@/api/config` 的**同一个**开关（无第二处环境变量判定）。收敛目标「请求层单分支」已达成；UI 层是否同样收敛需另行拍板（会改动 mock 模式下的界面行为，且无自动化测试覆盖 mock 模式，属不可验证变更，故未擅自扩大范围）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-18 | `node --experimental-strip-types tests/qa/web-mock-convergence.test.ts`（新门禁） | PASS：请求层 `USE_MOCK` 0 处；仅 `mock/dispatch.ts` 可 `getMockHandlers`；`mockOr/Value/Map/Void` 4 入口齐备；处理器名受 `keyof MockHandlers` 约束；`src/api` 不引用 `__fixtures__`；`USE_MOCK` 全应用仅 `@/api/config` 一处定义、`import.meta.env.VITE_USE_MOCK` 仅 config.ts 读取 |
| 2026-10-18 | `pnpm --filter "./apps/web" exec tsc --noEmit -p tsconfig.json` | PASS（0 error；改写前一度 18 error，见「已完成代码项」） |
| 2026-10-18 | `pnpm --filter "./apps/web" run test` | PASS：7 files / 67 tests（测试以 `USE_MOCK:false` 打桩 config，实际走真实分支，未被收敛影响） |
| 2026-10-18 | `pnpm --filter "./apps/web" run build`（vite） | PASS：产物 `dist/`（`index-*.js` + vendor 分包），构建期无 mock 相关残留 |

#### 当前阻塞

- **mock 模式无自动化覆盖**：`USE_MOCK=true` 路径仅由 code review 与 fixtures 单测间接保证，无端到端运行证据（本次以「不改行为、只改判定位置」为约束降低风险）。

### R8-12 decompose schema eval（C20：strict 100 采样 ≥99%）（2026-10-18）

> 对应方案 §4.5「AI 批次额外：strict 模式 100 次采样 ≥99%」；设计文档标为 C20 待办，`validator.py` 中「LLM 自检待 C20 eval 落地后启用」即指本项。真实 LLM 采样需凭据（环境阻塞），故先落地**可复现的离线基线**并把真实采样路径一并实现为可选门。

#### 已完成代码项

- [x] `services/ai/tests/test_decompose_schema_eval.py`（新，5 用例）：
  - **离线正样本基线**：固定种子（`SEED=20261018`）生成 **100 条**「LLM 风格」拆解输出（含 ```json 围栏 / 前后解释文字 / 数值型 `version` / 1–10 任务 / 父子链 + 依赖 + 可选字段 / 4 类依赖类型与优先级枚举），逐条走 `extract_json → L1(Pydantic strict) → L2(判环/结构/孤立/范围/深度/任务数)`；断言 ≥99%（实测 **100/100**）。
  - **离线负样本集（16 例）**：strict 的另一半是「能拒」——非 JSON、`estimated_hours:"8h"`、缺 `reason`、`priority:"HIGH"`/`"p0"`、`title` 超长、`tasks:[]`、`dep.type` 未知、依赖成环、自依赖、`prev_idx` 越界、孤立任务、估时 0、`lag_days` 越界、深度 >4、任务数超限；逐条断言命中**预期错误码**（`L1_*`/`L2_*`）。
  - **L2 防御层**：`estimated_hours`/`lag_days` 在 schema 层已有 `gt/le`，故常规脏值在 L1 即被拦；用 `model_construct` 绕过 pydantic 直接构造非法对象，断言 L2 仍报 `L2_RANGE`（防止「L1 已拦 ⇒ L2 形同虚设」）。
  - **模板降级路径**：`template_decompose` 在 3 粒度 × 3 视角 × 3 预算 = 27 组合下输出**必须**直接通过 L1+L2（降级路径不可产出非法草稿）。
  - **真实 LLM 采样（可选门）**：`EVAL_LLM=1` + `LITELLM_API_KEY` 时对 100 条不同输入真跑模型，统计**首轮输出直接通过 strict** 的比例，写 JSON 报告（`EVAL_REPORT`，默认 `.eval/decompose-schema-eval.json`）并按 ≥99% 断言；无凭据时 `pytest.skip`（含原因）。
- [x] 该用例随 `ai-test` job 的 `pytest` 自动执行 → **离线 strict 基线现已进入 CI**；`ci.yml` 头注「待补齐」项 1 同步更新为「真实采样待凭据」。
- [x] `ruff check` 该文件干净（仓库既有 18 处 E501 等历史告警不在本次范围）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-18 | `cd services/ai && uv run pytest tests/test_decompose_schema_eval.py -s` | PASS：**4 passed, 1 skipped**；打印 `[C20 离线基线] 正样本 100 条 → L1(strict)+L2 通过 100 条（100.0%，阈值 ≥99%）` |
| 2026-10-18 | 同上（负样本子集） | PASS：16 例全部命中预期错误码（L1_SCHEMA_INVALID×7 / L2_CYCLE / L2_STRUCTURE×3 / L2_ORPHAN / L2_DEPTH_LIMIT / L2_TASK_LIMIT / L1_JSON_INVALID / L2_RANGE） |
| 2026-10-18 | `uv run pytest`（AI 服务全量） | PASS：**87 passed, 1 skipped**（跳过项 = 真实 LLM 采样门） |
| 2026-10-18 | `uv run ruff check tests/test_decompose_schema_eval.py` | PASS：All checks passed |

#### 当前阻塞

- **真实模型合规率未测**：本机无 LiteLLM/供应商凭据，`EVAL_LLM=1` 路径未实跑；离线基线验证的是 schema/校验器管道与回归，**不代表某个模型的真实首次合规率**。有凭据环境执行：`EVAL_LLM=1 EVAL_REPORT=.eval/llm.json uv run pytest tests/test_decompose_schema_eval.py -k llm -s`。

### R8-13 推送 GitHub + GitHub Actions CI 首跑全绿（2026-11-01）

> 本地工作区首次推送到 `github.com/Fatcattie/OpenSchedule`：以上游 `3465504`（移动端增量 1–12 + node_modules 快照）为父提交**快进衔接**（无 force push；本地三方合并结果经逐文件比对为上游超集：353 同 / 5 处为本地有意改动）。原本地提交保留在分支 `backup/pre-push-335a787`。CI 首跑暴露 4 个仅在 Linux/真实 PG16 上出现的缺陷，修复后 7 个 job 全绿。此前 §4.1 #1/#3「待 CI 首跑」、#4「PG16 恢复演练未完成」由本节给出证据。

#### 已完成代码项

- [x] **推送**：`d61ab9e7e`（生产化 R1–R12 + node_modules 快照按当前 lockfile 重新入库，用户决策沿用依赖快照口径）；`.qoder/`、`.umadevrc`、`install.err` 仅写入本机 `.git/info/exclude`，未入库。
- [x] **AI 打包（Linux 大小写）**：`services/ai/pyproject.toml` `readme = "README.md"` → `readme.md`（实际文件名；Windows 不区分大小写故本地未暴露，hatchling 在 Linux 报 `Readme file does not exist`）。同类问题：git 中三处 `dockerfile` 统一更名 `Dockerfile`，与 `release.yml`、compose 及 `tests/qa/deploy-prod-gates` 引用一致（否则首次 CD 构建镜像必失败）。
- [x] **libpq 不认 Prisma URL 参数**：`deploy/postgres/{backup,restore,verify-restore}.sh` 新增 `libpq_url`，交给 psql/pg_dump/pg_restore 前剔除 `schema`/`connection_limit`/`pool_timeout`/`pgbouncer`/`statement_cache_size`/`socket_timeout`/`sslaccept`，保留 `sslmode` 等 libpq 参数。**同时修复生产缺陷**：`docker-compose.prod.yml` 的 `pg-backup` 传 `…?schema=public`，原先每次定时备份都会 `invalid URI query parameter: "schema"`。`ci.yml` 中直连 psql 的两处同步改为 `${DATABASE_URL%%\?*}`。
- [x] **依赖审计新公告（high，可交付范围）**：根 `pnpm.overrides` 加 `follow-redirects ^1.16.2`（GHSA-q3jh-wrc6-jgq8，web→axios）、`body-parser ^2.4.0`（GHSA-27r3-jxmh-p828）、`multer ^2.5.0`（GHSA-q7qp-rjg7-q26m）（后两者经 api→@nestjs/platform-express；Nest 11 最新 11.2.8 仍锁旧版，修复版仅在 Nest 12 大版本，故用补丁级 override）。锁文件内三者各仅单一版本，全局 override 无跨大版本副作用。`pnpm install` 同时剪除快照中锁文件外的孤儿包约 8.3 万文件（R9-3 改 Envelope 直连前遗留的 `@sentry/*`/OpenTelemetry 等），快照与 `pnpm-lock.yaml` 恢复一致。
- [x] **PG 客户端/服务端版本错配**：runner 自带 pg_dump 高于 PG16，dump 含 `SET transaction_timeout`，PG16 `pg_restore` 报 `unrecognized configuration parameter`。CI 改为经 `docker exec` 在 `postgres:16-alpine` 服务容器内执行 psql/pg_dump/pg_restore（与生产 `pg-backup` 及 `deploy/drill/run.mjs` 同构），dump 放服务 volume `/tmp/pgdump`（宿主与容器同路径，供 `restore.sh` 宿主侧可读性校验）。生产不受影响（`pg-backup` 本就运行于 PG16 镜像）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-11-01 | 本地：api `vitest` / web `vitest` / ai `uv sync --frozen && uv run pytest` | PASS：api **54 files / 501 tests**；web **98 tests**；ai **179 passed + 1 skipped** |
| 2026-11-01 | 本地：`tests/qa` + `tests/security` + `tests/authz` 门禁、`pnpm run lint`（typecheck） | PASS：18 项门禁全绿；typecheck 通过 |
| 2026-11-01 | 本地：`node scripts/audit-deployable.mjs --audit-level high` | PASS：可交付范围 ≥ high 归零（移动端残余 js-yaml/brace-expansion/node-forge/source-map-js/zod 仍为接受风险） |
| 2026-11-01 | 本地：`shellcheck -s bash -S style deploy/postgres/*.sh`；`libpq_url` 4 组输入 | PASS：0 条；`?schema=public` 剔除、`sslmode=require` 保留、无查询串原样 |
| 2026-11-01 | GitHub Actions run `41290407407`（`d61ab9e7e`，首跑） | FAIL 3/7：AI Service Test（readme 大小写）、Dependency Audit（3 条 high）、Migration（psql `schema` 参数）；Lint/Build/API Test/Web Test 绿 |
| 2026-11-01 | GitHub Actions run `41295926055`（`c2bfa6fb4`） | FAIL 1/7：Migration · Restore backup（`transaction_timeout`，客户端版本错配） |
| 2026-11-01 | GitHub Actions run `41296224447`（`d5fd42c56`） | FAIL 1/7：Migration · Restore backup（dump 在容器内，宿主不可读） |
| 2026-11-01 | GitHub Actions run **`41296521906`**（**`07cd6aa88`**） | **PASS 7/7**：Lint / Build / API Test / Web Test / AI Service Test / Dependency Audit / Migration |
| 2026-11-01 | 同上 · Migration：官方 `postgres:16-alpine` 空库 | `8 migrations found` → `All migrations have been successfully applied`；`migrate status`：`Database schema is up to date!`；漂移检查：`No difference detected.` |
| 2026-11-01 | 同上 · Migration：`test:e2e`（真实 PG16） | PASS：**3 files / 19 tests**（`migrations` / `tenant-isolation` / `workspace` e2e） |
| 2026-11-01 | 同上 · Migration：备份恢复演练 | PASS：`pg_restore (PostgreSQL) 16.15`；哨兵行写入 → `pg_dump` → 隔离库 `openschedule_restore` → `pg_restore` → `verify-restore.sh`：`tenants`/`tasks`/`ai_proposal_tasks` 三表存在，`tenants rows=1`（哨兵命中） |

#### 当前阻塞

- **恢复演练仅为 CI 级**：数据量为空库 + 哨兵行，未记录 RTO；目标机 `deploy/drill/run.mjs`（含生产 `pg-backup` 定时备份实跑、RTO 记录）仍待服务器（§4.2 RPO/RTO）。
- ~~CI 注解：`actions/*@v4` 基于已弃用的 Node 20；`ubuntu-latest` 自 2026-10-19 起迁移到 Ubuntu 26——当前不影响结果，后续可升级 actions 主版本 / 固定 runner 版本。~~ **2026-11-02 已处理**：全部 action 升至 Node 24 主版本（checkout v5 / setup-node v5 / setup-python v6 / upload-artifact v6 / pnpm action-setup v5 / docker build-push v7 · login v4 · setup-buildx v4）；runner 迁移 Ubuntu 26 仍待观察。
- ~~本地 `backup/pre-push-335a787` 分支可在确认后删除。~~ **2026-11-02 已删除**（提交 `335a787` 已在 main/origin/main 中）。
- **移动端接真实后端前置（2026-11-02）**：`API_BASE` 改为 `${EXPO_PUBLIC_API_URL}/api/v1`（真机可用）；`USE_MOCK` 改为三态（显式 env 优先，否则「配了源站即真实」），eas preview/production 固定 `EXPO_PUBLIC_USE_MOCK=false`；占位 `projectId` 移除，改由 `app.config.ts` 读 `EAS_PROJECT_ID` 注入；新增 `tests/config-env.test.ts`（mobile 59 suites / 1019 tests 全绿）。**仍需**：用户 Expo 账号 `eas init` 取真实项目 ID、`eas env:set` 设源站；移动端真实分支对后端接口的端到端联调未做（audit 审批后端无端点 N6）。

### R10-1 生产部署与运维开工：生产编排 + web 生产镜像 + CD + runbook（2026-10-18）

> 用户本次拍板范围第三批「R10 生产部署与运维开工」。R10 原定义（2 周）含：生产编排（D-08）、web 生产镜像、CD 流水线、备份+恢复演练、LiteLLM 部署、runbook；验收 = §4.1 门禁全绿 + staging/prod 同构跑 1 周。本次交付**可编写+可静态验证**的全部编排与手册，并把「需真实环境」的部分显式列为阻塞。
> **决策落地：D-02 = A（单机 compose 生产版起步，k8s 列 P2）、D-08 = 云主机 + Docker。**

#### 已完成代码项

**生产编排（`deploy/docker-compose.prod.yml`，独立栈不叠加 dev）**
- [x] 端口收敛：**仅 caddy 发布 80/443**；pg/redis/minio/api/ai/litellm/prometheus/grafana 一律不映射宿主端口（公网 `/metrics` 由 Caddy `respond 403` 拒绝）。
- [x] 生产硬化：全服务 `restart: unless-stopped` + 健康检查 + `deploy.resources.limits` + 日志轮转（`json-file 20m×5`）；命名卷全部顶层声明（门禁校验无 typo）。
- [x] 镜像不可变：`${REGISTRY:?}/openschedule-{api,web,ai}:${IMAGE_TAG:?}`（生产机不 build，回滚 = 改 tag）；基础设施镜像固定 tag（MinIO 固定 `RELEASE.2024-10-13T13-34-11Z`）。
- [x] **密钥 fail-fast**：`REGISTRY`/`IMAGE_TAG`/`DOMAIN`/`ACME_EMAIL`/`POSTGRES_PASSWORD`/`MINIO_ROOT_PASSWORD`/`LITELLM_MASTER_KEY`/`GRAFANA_ADMIN_PASSWORD` 等一律 `${VAR:?}` —— 缺失即拒绝启动，杜绝 `change-me`/弱默认上生产（门禁断言「密钥类变量不得有非空默认值」）。
- [x] 生产语义：`DB_AUTO_MIGRATE=false`（迁移交给独立 job）、`METRICS_ENABLED=true`、`NODE_ENV/APP_ENV=production`、AI 只经 `http://litellm:4000/v1`、`CORS_ORIGINS` 指向生产域名。
- [x] 运维 job：`migrate`（`--profile tools`，`npx prisma migrate deploy` + status，保持 CI 同源）、`pg-backup`（`--profile ops`，复用 `deploy/postgres/backup.sh`，每日 `pg_dump --format=custom` + 保留期清理）。
- [x] 可观测性沿用 R9：`--profile observability` 起 Prometheus/Grafana（Grafana 经 Caddy 子路径 `/grafana/` 暴露）。

**web 生产镜像（`apps/web/Dockerfile` 新增 build/prod 阶段 + `deploy/web/nginx.conf`）**
- [x] 多阶段：`build`（`pnpm --filter ./apps/web run build`，`ENV VITE_USE_MOCK=false` 构建期锁死假数据不上线）→ `prod`（`nginx:1.27-alpine` 托管 `apps/web/dist`，`HEALTHCHECK` 探 `/health`）。
- [x] 清掉历史遗留注释（`dist-mvp-*` 早已回归 `dist`）；`nginx.conf`：SPA 回退 `try_files ... /index.html`、`/assets/*` 一年 immutable、入口文档 `no-cache`、安全头、`/health`，**不做 API 代理**（避免与 Caddy 双层代理）。

**入口与 TLS（`deploy/caddy/Caddyfile`）**
- [x] 自动 HTTPS（`{$DOMAIN}` + `{$ACME_EMAIL}`，`admin off`）；路由 `/api/*` + `/health` → `api:3000`、`/metrics` → 403、`/grafana/*` → grafana、其余 → `web:80`；HSTS/`X-Content-Type-Options`/`X-Frame-Options`/`Referrer-Policy`，抑制 `Server` 头。

**LiteLLM 部署（`deploy/litellm/config.yaml` + compose `litellm` 服务）**
- [x] 模型别名与 AI 服务对齐（`deepseek-chat` 默认；`glm-4-plus`/`gpt-4o-mini` 备选，用于 C20 eval 对比）；凭据**全部** `os.environ/*`（文件内无明文密钥，门禁断言）；`master_key` 走环境变量；`drop_params`/`num_retries`/超时与 §3.5.4 口径一致。

**CD 流水线（`.github/workflows/release.yml`）**
- [x] 推 `v*` tag（或手动 `workflow_dispatch` 指定旧 tag 回滚）→ `build-images`（api/web(prod target)/ai 三镜像推 GHCR，GHA 缓存）→ `migrate`（**用发布镜像内的 prisma CLI** 执行 `migrate deploy` + `migrate status`，与运行时同版本）→ `deploy`（staging：pull → migrate → `up -d --remove-orphans` → `/health`+首页 200 冒烟）→ `deploy-production`（**`environment: production` 人工审批 gate**，校验必须是 `v*`，发布前拉起 `pg-backup` 作回滚兜底）。
- [x] 密钥全部 `${{ secrets.* }}`（门禁断言无明文密钥、无 `pull_request_target`、迁移先于滚动）。

**备份 + 恢复演练 + runbook**
- [x] `docs/ops/runbook.md`：速查表、拓扑与端口、发布流程（CI/手工双路径）、**回滚三层策略**（应用改 tag 优先、不回滚迁移）、**8 条告警逐条处置表**（与 `alerts.yml` 名称严格一致，含第一动作/升级路径）、备份与**隔离库恢复演练步骤**（取出 dump → 建隔离库 → `restore.sh` → `verify-restore.sh` → 记录 RTO）、密钥清单（§3.7 必填/可选）、容量与扩容信号、已知边界。
- [x] `deploy/.env.production.example`（生产变量模板，标 [必填]/[可选]；`.gitignore` 增补放行该**模板**，真实 `deploy/.env.production` 仍被排除）。
- [x] `deploy/readme.md` 新增「生产部署（R10）」章节；根 `.env.example` 第 16 组指向生产模板；根 `package.json` 增 `docker:prod` / `docker:prod:config`。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-18 | `node --experimental-strip-types tests/qa/deploy-prod-gates.test.ts`（新门禁，8 组断言） | PASS：仅 caddy 发布端口；常驻服务 restart/资源上限/日志轮转齐备；api/web/ai 无源码挂载；命名卷已声明；8 个 `${VAR:?}` 与 `deploy/.env.production.example` 逐项一致；无 `change-me`、密钥类变量无非空默认；web 生产层为 nginx + `VITE_USE_MOCK=false` + `dist`；Caddyfile 四路由 + HSTS；LiteLLM 凭据全 `os.environ` 无明文；release.yml 四 job + `environment: production` + 迁移先于滚动；runbook 覆盖 8 条告警（并与 `alerts.yml` 对齐）+ restore/verify 流程；ci.yml migration/备份步骤未回归 |
| 2026-10-18 | YAML 解析（`yaml` 包） | PASS：`docker-compose.prod.yml` / `litellm/config.yaml` / `release.yml` / `ci.yml` 全部可解析且结构断言通过 |
| 2026-10-18 | `pnpm --filter "./apps/web" run build` | PASS：产物落 `dist/`（与 prod 阶段 `COPY /app/apps/web/dist` 路径一致） |
| 2026-10-18 | `pnpm run lint` / `pnpm run build` / `node scripts/audit-deployable.mjs --audit-level high` | PASS（可交付范围 ≥ high 归零） |
| 2026-10-18 | 门禁全量重跑 | PASS：`tests/qa/*` **9** 个（新增 web-mock-convergence、deploy-prod-gates）+ `tests/security/*` 5 个 |

#### 当前阻塞

- **编排未真实启动**：本机无 Docker/k8s，`docker compose config`、镜像构建、Caddy 证书签发、`migrate`/`pg-backup` job 均**未实跑**；本次为静态契约 + YAML 结构验证，首次真实发布需按 runbook step-by-step 演练（runbook §8 已显式记录）。
- **CD 未实跑**：`release.yml` 需 GitHub Actions + GHCR + 目标机 SSH 凭据 + `staging`/`production` Environment 保护规则；本地无 git 二进制，无法推送 tag 触发。
- **恢复演练仍待真实 PG**：备份/恢复脚本自 R1 起在 CI migration job 中已接线，但**首次实跑**（含 RTO 记录）需 PG16 环境；本机 PGlite 不能替代 `pg_dump/pg_restore`。
- **staging/prod 同构跑 1 周观察期**（R10 验收项）需真实 staging 环境，未开始。

### R10-2 staging 首次部署演练脚本（2026-10-19）

> R10-1 把生产编排写好了但**一次都没跑过**。本批交付「可一键在目标机跑完 11 步并产出可粘贴证据」的演练脚本 + 手册，把 §4.1 三个「从未实跑」阻断项（#1 迁移/空库建库、#3 集成冒烟、#4 **至少一次恢复演练成功**）收敛为「目标机执行即得证据」。

#### 已完成代码项

- [x] `deploy/drill/run.mjs`：11 步编排 `preflight → config → images → migrate → up → ps → smoke → backup → restore → rollback → report`；关键步骤（config/images/migrate/up/ps/smoke/restore）失败即中止且**仍写出失败明细报告**；退出码 0 = 全通过。
- [x] `smoke` 步骤断言 `/health` 200 + 首页 200 + **公网 `/metrics` 403**（与 Caddy 端口收敛口径一致）；`restore` 步骤建隔离库 `os_drill` 跑 `restore.sh` + `verify-restore.sh` 并**记录 RTO 秒数**；`rollback` 用旧 `IMAGE_TAG` 滚动一次再切回。
- [x] 报告落 `deploy/drill/evidence/drill-<ts>.{json,md}`，md 末尾自动生成「粘贴进 `production-progress.md` 的证据模板」。
- [x] `docs/ops/staging-drill.md`：前置条件、执行命令（`--dry-run` / `--build` / `--base-url` / `--rollback-tag`）、逐步关闭哪些门禁、粘贴模板、已知边界（无 Docker 只有 `--dry-run`；证书需域名就绪后单独验证）。
- [x] 根 `package.json` 增 `drill` / `drill:dry`（`drill:dry` = 用 `deploy/.env.production.example` + `--allow-empty-secrets` 的纯静态前置检查）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-19 | `node deploy/drill/run.mjs --dry-run --env-file deploy/.env.production.example --allow-empty-secrets` | PASS：`preflight.files` 齐备；`preflight.env` 9 类密钥显式列为空值（`--allow-empty-secrets` 放行）；`preflight.docker` 本机无 docker 降级为 WARN；报告写出 `deploy/drill/evidence/drill-2026-10-19T15-45-35-387Z.{json,md}` |
| 2026-10-19 | `tests/qa/load-and-seed-gates.test.ts`（含 drill 脚本/文档契约断言） | PASS |
| 2026-10-19 | `node --experimental-strip-types tests/qa/deploy-prod-gates.test.ts` | PASS（R10 编排契约未回归） |

#### 变更文件

- `deploy/drill/run.mjs`（新增）
- `docs/ops/staging-drill.md`（新增；§4 落地指向 `docs/ops/go-no-go.md`，替换原「R0 门禁清单」表述）
- `package.json`（`drill` / `drill:dry`）
- `.gitignore`（`deploy/drill/evidence/` 运行产物排除）

#### 当前阻塞

- **本机无 Docker**：只有 `--dry-run` 静态证据；`config/images/migrate/up/ps/smoke/backup/restore/rollback` 必须目标机实跑。
- 证书签发需域名解析就绪后单独验证一次（演练可 `--base-url http://localhost` 跳过 TLS）。

### R10-3 服务器初始化 + `.env.production` 生成（2026-10-22）

> 用户 2026-10-21 定部署目标 = 云服务器单机 compose；2026-10-22 要求初始化脚本兼容多种 Linux 发行版。本批把「拿到一台空云主机 → 能跑 `drill/run.mjs`」之间的手工步骤脚本化。

#### 已完成代码项

- [x] `deploy/server/bootstrap.sh`（root，幂等）：按 `/etc/os-release` 的 `ID`/`ID_LIKE` 分 **Debian 系**（Ubuntu/Debian 及衍生版，apt + docker-ce 源）与 **RHEL 系**（CentOS Stream/RHEL/Rocky/Alma/Oracle、Alibaba Cloud Linux、Anolis、OpenCloudOS、TencentOS、Fedora，dnf/yum + docker-ce 源；衍生版 `$releasever` 换算为 EL 主版本），openEuler 尽力支持；docker-ce 源失败回落发行版自带 docker + 独立 compose 二进制。
  - docker-ce 下载源 `--mirror auto`：官方不可达自动改用阿里云；`--registry-mirror` 写 Docker Hub 加速（国内拉 postgres/redis/caddy 基础镜像）。
  - 校验 **compose ≥ 2.24**（prod 编排 `env_file.path/required` 语法依赖），不满足先升级再装独立插件。
  - `daemon.json`：日志轮转 20m×5 + live-restore；已有文件则备份后用 python3 只补缺失键。
  - 部署用户 `deploy`：docker 组 + CI 公钥（与 `release.yml` 的 `DEPLOY_USER`/`$HOME/openschedule` 约定一致），可选 `--repo` clone。
  - 防火墙：仅在 ufw/firewalld **已启用**时放行 SSH(自动探测端口)/80/443/443udp，不擅自启用（防锁死 SSH）；提示云安全组。
  - `vm.overcommit_memory=1`（redis 持久化）、内存 < 4G 且无 swap 时建 swap、开启 NTP（ACME 与 AI 回调 HMAC 300s 时间窗依赖）。
  - `--check`：只出环境报告（CPU/内存/磁盘/compose 版本/80·443 占用/部署用户/时钟）。
- [x] `deploy/server/gen-env.sh`（部署用户执行）：从模板生成或补全 `deploy/.env.production`，**只补空值、绝不重生成已有密钥**（改库口令/`ENCRYPTION_KEY` 会致数据不可用），每次先备份；自动生成 7 个 fail-fast 密钥 + VAPID P-256 密钥对（openssl，base64url）；拼进 `DATABASE_URL` 的口令用 hex（base64 的 `+/=` 会破坏连接串）、`ENCRYPTION_KEY` = 32B base64；校验域名/邮箱/镜像前缀/tag 格式，派生 `CORS_ORIGINS`/`VAPID_SUBJECT`/`MAIL_FROM`；文件 600；列出未配置的可选项（Sentry/告警机器人/SMTP）；显示域名解析结果；有 docker 时跑全部 profile 的 `docker compose config`。
- [x] 门禁 `tests/qa/deploy-prod-gates.test.ts` 新增第 10 组（LF/`set -euo pipefail`、apt+dnf/yum 双路径与发行版识别、回落路径、compose ≥ 2.24、部署目录与 release.yml 一致、不擅自启用防火墙、gen-env 覆盖全部密钥且模板留空、hex 口令、不重生成、600 权限）。
- [x] `docs/ops/runbook.md` §2 前置改为脚本化步骤；`deploy/readme.md` 生产章节同步。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-22 | `shellcheck 0.11.0 -s bash -S style deploy/server/*.sh` | PASS：0 条（含 style 级） |
| 2026-10-22 | `node --experimental-strip-types tests/qa/deploy-prod-gates.test.ts` / `load-and-seed-gates.test.ts` | PASS |
| 2026-10-22 | 两脚本字节检查 | LF、无 BOM（`.gitattributes` `*.sh eol=lf` 兜底） |

#### 当前阻塞

- **未在真实 Linux 上执行**：本机无 bash/WSL 发行版/Docker，仅有 shellcheck 静态证据；首次在目标机运行即为实测（建议先 `--check`，再正式执行）。各发行版的 docker-ce 源可用性以实跑为准，openEuler 路径最不确定。

## R11 AI 服务加固

> 上游依据：`docs/ddd/production-ddd-design.md` §3.5/§3.7（AI 边界与回调约定）、§4.1 #3（幂等）。R11 目标：把「AI 回调 best-effort + run 内存态」两个生产不可接受点去掉——run 状态/已发帧可跨重启恢复、回调可靠投递且**失败可查可重放可告警**。AI 仍**不直连业务库**，唯一写库通道仍是主服务 `POST /internal/ai/results`。

### R11-1 run 持久化与重启恢复

- [x] `services/ai/app/services/run_store.py`：`AI_RUN_STORE=auto|redis|memory`；`redis` 连不上**启动失败**（fail-fast，生产默认），`auto` 探测失败降级 memory 并打结构化 `ai_run_store_degraded`（恢复时 `ai_run_store_recovered`），非法值显式拒绝。
- [x] 键布局（全部带 `AI_STATE_TTL_SECONDS`）：`osai:run:{id}`(hash 元数据) / `osai:run:{id}:frames`(list，`LTRIM` 保最近 `AI_STATE_MAX_FRAMES`) / `osai:runs`(zset 索引)；与主服务逻辑隔离（独立 db + `osai:` 前缀）。
- [x] `recover_orphans()`：启动时把上一进程遗留的 `running` 记录标为 `interrupted` 并补 `AI_RUN_INTERRUPTED` 终帧，避免重连客户端永久挂起。
- [x] `services/ai/app/routers/decompose.py`：拆解流逐帧 `append_frame`；**无内存态时从存储重放**已发帧，未终结则补确定性 `ai.error`（`AI_RUN_INTERRUPTED`）；记录缺失返回 `AI_RUN_NOT_FOUND`。服务**不提供执行续跑**（拆解流水线无检查点），主服务据 `interrupted` 决定重试。

### R11-2 回调可靠投递（签名 + 幂等 + 退避）

- [x] `services/ai/app/services/callback_signing.py`：HMAC-SHA256，签名字符串 `${timestamp}.${rawBody}`，头 `X-AI-Timestamp`/`X-AI-Signature`，**签实际发出的 raw bytes**（序列化单一来源）；与主服务 `services/api/src/common/auth/ai-callback-signature.ts`（`timingSafeEqualHex` + 300s 时间窗）逐字对齐。
- [x] `services/ai/app/services/callback_delivery.py`：携带 `Idempotency-Key: ai-run:<run_id>`（主服务全局幂等拦截器 24h 去重 → 重放安全）；指数退避（`2^(n-1)`，上限 8s，`AI_CALLBACK_MAX_ATTEMPTS` 次）；永久 4xx（除 `408/409/425/429`）立即停止重试，不退化为无意义重试。

### R11-3 死信：可查询 / 可重放 / 可告警

- [x] `services/ai/app/services/dead_letter.py`：重试耗尽或永久 4xx → 落 `osai:dlq:*`（`DLQ_IDS_KEY`/`DLQ_ENTRY_PREFIX`），有界 `AI_DLQ_MAX_ENTRIES` + TTL；结构化错误日志 `ai_callback_dead_letter`；**无仅本地文件后端**（以 Redis/memory 承载，满足「不得用仅本机文件」）。
- [x] `GET /ai/dead-letters`（服务 token 鉴权，`limit` 1–200）+ `POST /ai/dead-letters/{id}/replay`：重放沿用原 `Idempotency-Key`，重复重放安全；`mark_replayed` 记录 `replayed_at`/`replay_result`。
- [x] `services/ai/app/services/metrics.py` + `GET /metrics`（`text/plain; version=0.0.4`，零新依赖手写 exposition）：`openschedule_ai_up`、`openschedule_ai_dead_letters_recorded_total`、`openschedule_ai_dead_letters`、`openschedule_ai_run_store_mode{mode}`、`openschedule_ai_dead_letter_store_mode{mode}`；`record_dead_letter()` 内累计计数。
- [x] 告警接线：`deploy/observability/prometheus.yml` 增 `openschedule-ai` scrape job（`ai:8300`）；`alerts.yml` 增 `AiCallbackDeadLetters`（critical，`increase(...[15m]) > 0`）与 `AiRunStoreDegraded`（warning，`mode="memory"` 持续 15m）→ **规则总数 8 → 10**；`docs/ops/runbook.md` 补两条处置行（并修正 `AiDown`→`ApiDown` 笔误），`docs/ops/release-plan.md` 同步 10 条。

### R11-4 配置与门禁

- [x] env 落地：`services/ai/.env.example`、根 `.env.example`、`deploy/.env.production.example`（生产 `AI_RUN_STORE=redis`）。
- [x] compose 装配：dev `ai` 透传 `${AI_RUN_STORE:-auto}` + `AI_STATE_REDIS_URL=redis://redis:6379/3` + `depends_on redis(healthy)`；prod `ai` 硬编码 `AI_RUN_STORE: redis`（fail-fast）+ db3 + redis 依赖。
- [x] 新门禁 `tests/qa/ai-hardening-gates.test.ts`（8 组静态契约断言：run_store 持久化语义 / router 重放 / HMAC 双端对齐 / 幂等与退避 / 死信无文件后端 / 指标与告警 / env+compose / 测试面与 readme）。
- [x] 受影响门禁同步：`deploy-prod-gates.test.ts`（alertNames 10 + 生产 `AI_RUN_STORE=redis` 断言）、`load-and-seed-gates.test.ts`（告警数 8→10）、`observability-gates.test.ts`（AI scrape job + 2 条 AI 告警断言）。
- [x] `services/ai/readme.md` 更新：目录结构、R11 加固章节、死信/`/metrics` 接口、断线重连=持久化重放、测试与 eval 勾选、已知 TODO 收敛（原「内存 run 注册表 / 回调 best-effort」两条已消除）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-19 | `cd services/ai && uv run pytest -q` | PASS：**164 passed, 1 skipped**（含 `test_run_store`/`test_dead_letter`/`test_callback_delivery`/`test_router_recovery`/`test_metrics`） |
| 2026-10-19 | `uv run ruff check app/services/metrics.py tests/test_metrics.py tests/test_contracts.py` | PASS：All checks passed（修复 tests 中 `callback_delay_seconds` 过期导入，AI 用例集恢复可收集） |
| 2026-10-19 | `uv run ruff check app tests`（全量） | 既有 **11 处 E501**（`validator.py`/`llm_client.py`/`decompose.py`/`decompose_graph.py`，历史遗留、非本次改动文件）未处理，保持范围收敛 |
| 2026-10-19 | `node --experimental-strip-types tests/qa/ai-hardening-gates.test.ts` | PASS：R11 契约 8 组断言全过 |
| 2026-10-19 | `node --experimental-strip-types tests/qa/observability-gates.test.ts` / `deploy-prod-gates.test.ts` / `load-and-seed-gates.test.ts` | PASS：告警数、抓取 job、AI 持久化装配、runbook 覆盖一致 |
| 2026-10-19 | `node -e` YAML 解析（`deploy/observability/alerts.yml`） | PASS：**10 条规则**可解析 |

#### 变更文件

- `services/ai/app/services/run_store.py`、`dead_letter.py`、`callback_signing.py`、`callback_delivery.py`、`metrics.py`（新增/完善）
- `services/ai/app/main.py`、`app/routers/decompose.py`、`app/config.py`
- `services/ai/tests/{test_run_store,test_dead_letter,test_callback_delivery,test_router_recovery,test_metrics}.py`、`tests/fake_redis.py`
- `services/ai/.env.example`、`services/ai/readme.md`
- `.env.example`、`deploy/.env.production.example`、`deploy/docker-compose.yml`、`deploy/docker-compose.prod.yml`
- `deploy/observability/prometheus.yml`、`deploy/observability/alerts.yml`
- `docs/ops/runbook.md`、`docs/ops/release-plan.md`
- `tests/qa/ai-hardening-gates.test.ts`（新增）、`tests/qa/{observability-gates,deploy-prod-gates,load-and-seed-gates}.test.ts`

#### 当前阻塞

- **真实 Redis 跨进程重启恢复**：`auto/redis` 语义、`recover_orphans`、重放窗口均在 fake redis 单测覆盖；真机 Kill → 重启 → 断线客户端重放需 Docker/Redis 环境。
- **真实主服务回调幂等事务**：`Idempotency-Key` 去重以契约 + 主服务拦截器单测覆盖；真实 Redis + PostgreSQL 下的重复回调只落库一次需集成环境。
- **告警实触发**：`AiCallbackDeadLetters`/`AiRunStoreDegraded` 仅契约与规则加载验证，未在 staging 人为注入故障实触发。

## R12 上线冲刺（离线可验证部分）

> 上游依据：`docs/ddd/production-ddd-design.md` §4.1 Go/No-Go、§4.2 SLO。R12 = 上线前的压测、种子、灰度/回滚预案、门禁核对。本批交付**所有不依赖真实环境即可编写并静态验证**的部分；真实数值与实触发显式列为环境证据。

### R12-1 压测（k6 四链路 + 阈值）

- [x] `qa-load/k6/{01-auth,02-workspace-read,03-workspace-write,04-task-flow}.js` + `lib.js`：覆盖鉴权/读/写（乐观锁）/任务生命周期四链路；阈值集中在 `lib.js`（P95/错误率/自定义指标）。
- [x] `qa-load/run.mjs`：`--check` 做**静态校验**（语法、阈值/指标齐备、无硬编码真实地址、口令走 `__ENV`、四链路存在、k6 运行时纯净无 Node API），并生成 `qa-load/evidence/load-<ts>.{json,md}`。
- [x] `qa-load/k6/README.md`：执行方式与阈值口径。
- [x] 根 `package.json` 增 `load` / `load:check`；`.gitignore` 排除 `qa-load/evidence/`。

### R12-2 首个租户种子（幂等）

- [x] `scripts/seed-first-tenant.mjs`：注册租户/成员/演示项目，**幂等**（重复运行复用既有资源不重复建）；`--selftest` 用假 API 断言首跑创建、二跑复用、仅 1 次项目创建。
- [x] 根 `package.json` 增 `seed:tenant` / `seed:tenant:selftest`。

### R12-3 灰度发布与回滚预案

- [x] `docs/ops/release-plan.md`：适用范围与前提、**9 项发布前置检查表**、两条灰度路径（权重灰度需 Caddy 多 upstream / 蓝绿改 `IMAGE_TAG`）、冻结期与发布窗口、回滚决策树（错误率/时延/数据/迁移）、expand/contract 三问、发布记录模板；指标清单与 `alerts.yml` 一致（含新增 2 条 AI 告警）。

### R12-4 Go / No-Go 逐项核对表

- [x] `docs/ops/go-no-go.md`：把 §4.1 的 **8 项阻断条件**逐条映射到仓库证据载体与离线判定（当前：**Go 4 · No-Go 3 · 待 CI 首跑 2**，总判定 **No-Go**），并列 §4.2 SLO 证据口径与「解除 No-Go 的最小动作清单」。
- [x] `docs/ops/release-plan.md` 前置检查第 1 项改指向 `docs/ops/go-no-go.md`（原指向不存在的「R0 门禁清单」）。

#### 验证记录

| 日期 | 命令/证据 | 结果 |
|---|---|---|
| 2026-10-19 | `node qa-load/run.mjs --check` | PASS：`CHECK_OK`（lib 语法/阈值/凭据、四链路齐备、k6 运行时纯净），报告 `qa-load/evidence/load-2026-10-19T15-45-22-360Z.{json,md}` |
| 2026-10-19 | `node scripts/seed-first-tenant.mjs --selftest` | PASS：`SELFTEST_OK`（首跑创建、二跑幂等复用、假 API 仅 1 次项目创建） |
| 2026-10-19 | `node --experimental-strip-types tests/qa/load-and-seed-gates.test.ts` | PASS：四链路 / 种子幂等 / 灰度回滚预案 / Go-No-Go 核对表 契约断言 |
| 2026-10-19 | `node deploy/drill/run.mjs --dry-run ...`（R10-2，前置检查含 Go-No-Go 联动） | PASS |

#### 变更文件

- `qa-load/k6/{01-auth,02-workspace-read,03-workspace-write,04-task-flow,lib}.js`、`qa-load/k6/README.md`、`qa-load/run.mjs`
- `scripts/seed-first-tenant.mjs`
- `docs/ops/release-plan.md`、`docs/ops/go-no-go.md`（新增）
- `tests/qa/load-and-seed-gates.test.ts`（新增）
- `package.json`、`.gitignore`

#### 当前阻塞

- **真实压测数值**：k6 需目标机与已起栈的 API；本机只有 `--check` 静态证据，P95/错误率基线未取得。
- **真实 staging 告警触发 / Sentry DSN / ZAP 扫描**：均需真实环境（见 §R12-4 判定）。
- **CI 首跑**：`ci.yml` 的 migration/web-test/ai-test/e2e 未在 GitHub Actions 观测，Go/No-Go 第 1/3 项为「Go（待 CI 首跑）」。

## R11 完成定义

R11 只有在以下条件均有证据后才标记 `DONE`：

1. 真实 Redis 下 AI 进程 Kill → 重启，断线客户端重放已发帧成功、未终结 run 收到 `AI_RUN_INTERRUPTED`（非内存态）。
2. 真实主服务 + Redis + PostgreSQL 下，同一 `Idempotency-Key` 的重复回调只落库一次；死信 `replay` 幂等。
3. `AiCallbackDeadLetters` / `AiRunStoreDegraded` 在 staging 人为注入故障时按规则触发并被值班看见。
4. 生产编排 `AI_RUN_STORE=redis` 在 Redis 不可用时确为 fail-fast（不静默降级）。

## R12 完成定义

R12 只有在以下条件均有证据后才标记 `DONE`：

1. `node qa-load/run.mjs` 在目标机取得四链路压测基线，阈值全绿并把报告贴回本文档。
2. `scripts/seed-first-tenant.mjs` 在真实环境首跑/二跑幂等通过。
3. `docs/ops/go-no-go.md` 8 项 §4.1 全绿（或已接受风险留档），总判定改为 **Go**。
4. 按 `docs/ops/release-plan.md` 完成一次真实发布（含一次回滚演练），发布记录回填。

## R10 完成定义

R10 只有在以下条件均有证据后才标记 `DONE`：

1. `docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml config` 通过，且 `up -d` 后全部服务 healthy、`https://$DOMAIN/health` 200。
2. 生产 web 镜像由 CI 构建（`target: prod`），静态产物经 Caddy 提供且 `/api/*` 正常代理；构建期 `VITE_USE_MOCK=false` 生效（产物无 mock chunk）。
3. CD 流水线跑通一次完整发布：三镜像入 GHCR → 迁移 job → staging 自动 → production 人工审批 → 发布后冒烟通过；并用**回滚旧 tag** 演练一次应用回滚。
4. 备份 + **隔离库恢复演练**在 PG16 上实跑并记录 RTO；`verify-restore.sh` 退出码 0。
5. LiteLLM 容器实跑，AI 服务经 `LITELLM_URL` 调用成功（含一次真实拆解全链路）。
6. §4.1 Go/No-Go 门禁全绿；staging 与 prod 同构运行 1 周观察期无 P0/P1 故障。
7. 10 条告警在 staging 人为注入故障时按规则触发（R9 验收项，与 R10 观察期同步；R11 新增 2 条 AI 告警一并验证）。

## R7 完成定义

R7 只有在以下条件均有证据后才标记 `DONE`：

1. ✅ `USE_MOCK` 默认 false；mock 仅作为显式测试 fixture/本地降级开关。（R7-1 + R7-5 + R7-7；R8-5 起 mock 源文件迁至 `src/__fixtures__/`，`src/api/` 下仅剩懒加载入口）
2. ✅ localStorage 演示数据逐域迁移或下线；全局 grep 演示键仅剩测试 fixture。（R7-7：`os_ws_v1_ws_notifications` 清零；`os_ws_v1_tasks`/`os_ws_v1_reminders`/`os_ws_v1_notification_forward_log` 属 D-07 工作台体系，显式记录为待拍板，非遗漏）
3. ✅ **人员域与主 Bearer 鉴权收敛，sessionClient/CSRF 删除且权限矩阵回归全绿**（R7-6，2026-10-10 完成）。
4. ✅ 关键页面服务端状态统一 TanStack Query；看板 WS 实时刷新与 HTTP fallback 均可用。（R7-7：通知域 `/notifications` + 今日聚焦域 `/me/today` 已迁；看板 WS 由 R6-4 完成，`useWsEvents` → `queryClient.invalidateQueries` 链路保留）
5. ✅ 改密码、IM 转发、AI generator、角色切换等本地模拟点清零。（R7-2/R7-3/R7-4 + R7-7 的 `mockUsers`/`mockMe` 引用清零；AI generator 本地降级为 §3.9 允许项）
6. ✅ 路由级代码分割、固定 `dist` 产物目录、`emptyOutDir=true` 完成并有构建证据。（R7-5）

**R7 状态**：代码侧 6 项 DoD 全部满足 → 标记 `CODE_COMPLETE`。剩余 `DONE` 依赖环境证据（真实 PG 下 `/notifications` 收件箱轮询、`/me/today` 排序、人员域 Bearer 全链路端到端），与 R1/R3/R4/R5/R6 同级阻塞。

## R6 完成定义

R6 只有在以下条件均有证据后才标记 `DONE`：

1. 成员 onboarding（D-05 B）端到端：admin 登录 → `POST /auth/members` 代建（临时密码）→ 新成员登录拿到 `mustChangePassword=true` → `POST /auth/change-password` 后标志清零。
2. personal-tasks：`/me/tasks` CRUD + 完成（actual_hours ★D3）+ 重开 + 关联团队任务在真实 PostgreSQL 上全过；跨租户/他人个人任务不可见（40401）。
3. 自动化触发：任务完成事件 → 内置 2 条系统规则（done 自动标记标签 + done 通知创建者）在 staging 实跑落库；triggerCount/lastTriggeredAt 更新可查；task.completed 不二次触发（D-13）。
4. WS 网关：浏览器 socket.io 连接（Bearer 鉴权）→ 任务创建/状态变更在租户房间实时收到帧；多浏览器同项目看板同步刷新。
5. §3.2 对应验收项（邀请/成员 onboarding、个人计划模块、自动化触发器演示闭环、WS 实装）全绿。

## 完成定义

R1 只有在以下条件均有证据后才标记 `DONE`：

1. 空库 `prisma migrate deploy` 一次成功。
2. `prisma migrate status` 无 pending migration。
3. `migrate diff --from-migrations --to-schema-datamodel` 无 DDL 漂移。
4. AI apply 与 `AiProposalTask` 记录同事务、跨租户隔离测试通过。
5. PostgreSQL 备份可恢复至隔离库并通过关键数据校验。
6. CI migration job 全绿。

R3 只有在以下条件均有证据后才标记 `DONE`：

1. 双实例 API（compose 双容器 + Redis）下 outbox 关键事件只被分发一次（原子认领 `lockedUntil` 生效）。
2. 杀任一路径（BullMQ 或 setInterval 兜底）后，提醒/重试/过期/升级副作用不丢、不重复（`fire()`/`dispatchDue()`/`retryDueDeliveries()` 原子谓词验证）。
3. 进程崩溃/重启后 pending outbox 行可由扫描重放（`next_attempt_at` 退避生效）。
4. `/health/ready` 在 staging 被部署探针实际使用（liveness/readiness 分离验证）。
5. §2.5 订阅表中已接线项（notification.failed 监听）有集成测试；未接线项（automation/WS/投影）显式记录为 R6 任务。

R4 只有在以下条件均有证据后才标记 `DONE`：

1. 压测/脚本触发登录接口 42901（Redis 下多实例窗口一致，非仅单实例 Map）。
2. Webhook SSRF 测试：内网/169.254/环回/私有地址 URL 被拒；DNS rebinding（解析到内网）被拒。
3. 伪造 AI 回调（签名错/超时间窗/重放）被拒；正确签名被接受。
4. 上传伪造扩展名（PNG 字节标 pdf 等）被拒，magic number 与声明 MIME 不符即 40001。
5. `webhook.secret` / `calendar token` 在 DB 中为 `v1.*` 自描述密文（非明文），日志/响应/审计无明文泄露。
6. 跨租户 authz 回归 5 例（tenant-isolation）进 CI 且全绿；审计断言测试进 CI。

R5 只有在以下条件均有证据后才标记 `DONE`：

1. 三通道各有真实发送截图级证据：邮件进 mailpit 收件箱、IM 消息达飞书/钉钉（MCP 网关真实出站）、浏览器收到系统级通知（Push）。
2. 失败投递落 `delivery.lastError` 且 notification.failed 可观测；退避重试在 Redis（BullMQ repeatable）与 DB 兜底两条路径均实跑通过。
3. 免打扰补发口径（D-12）在真实时区用户上实跑：窗口内挂起 → 窗口结束补发，且不消耗尝试次数。
4. 偏好路由/免打扰单测 ≥10 例进 CI 且全绿（本批 18 例已满足，待 CI 接入）。
5. reminder.due 端到端：提醒触发经三通道实发（依赖 R3 的 Redis zset 实跑）。
