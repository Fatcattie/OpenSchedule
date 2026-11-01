# deploy/ —— 本地开发栈与部署编排

OpenSchedule 本地开发环境编排（Docker Compose v2，无 `version` 字段，要求 Docker Compose v2 及以上）。
方案出处：chapter_02 §2（目录结构）与 B1（脚手架批次验收点：`docker compose up` 一键起、`/health` 全绿、CI 跑通）。

## 服务清单

| 服务 | 镜像/构建 | 端口（宿主:容器） | 用途 | 数据卷 |
|------|-----------|------------------|------|--------|
| postgres | postgres:16-alpine | 5432:5432 | 主存储（PG 全文搜索 pg_trgm） | pgdata |
| redis | redis:7-alpine | 6379:6379 | BullMQ 队列 + zset 延迟提醒 + WS 广播 | redisdata |
| minio | minio/minio:latest（TODO：发布前固定 RELEASE tag） | 9000:9000（S3 API）/ 9001:9001（控制台） | 对象存储（生产切 OSS/COS 只改配置） | miniodata |
| api | 自建：services/api/Dockerfile | 3000:3000 | 主后端（NestJS 模块化单体，唯一写库方） | — |
| web | 自建：apps/web/Dockerfile | 5173:5173 | 前端 SPA（React 19 + Vite dev server，HMR 直连） | — |
| ai | 自建：services/ai/Dockerfile | 8300:8300 | AI 服务（FastAPI + LangGraph，永不直连业务库） | — |
| prometheus（profile=observability） | prom/prometheus:v2.54.1 | 9090:9090 | 指标抓取（api `/metrics`）+ 告警规则求值 | promdata |
| grafana（profile=observability） | grafana/grafana:11.2.0 | 3001:3000 | 看板（自动 provision 数据源与 OpenSchedule API 看板） | grafanadata |
| mailpit（默认关闭） | axllent/mailpit | 1025:1025（SMTP）/ 8025:8025（UI） | 本地邮件收件箱（方案 B1 要求，注释块启用） | — |

## 常用命令（均在仓库根目录执行）

```bash
cp .env.example .env          # 首次必须：环境变量模板（真实凭据不进 git）

# 全栈一键启动（构建并后台运行全部 6 个服务）
pnpm docker:up                # = docker compose --env-file .env -f deploy/docker-compose.yml up -d --build

# 仅基础设施（日常本地开发推荐：容器跑 pg/redis/minio，三服务本地跑）
pnpm docker:infra

# 可观测性栈（R9）：Prometheus 9090 + Grafana 3001（依赖 api 健康）
pnpm docker:obs

# 查看状态 / 日志 / 停止 / 清理
pnpm docker:ps
pnpm docker:logs              # 全量日志，-f 跟随
docker compose --env-file .env -f deploy/docker-compose.yml logs -f api web ai
pnpm docker:down              # 停止（保留数据卷）

# 重建单个服务（改 Dockerfile / 依赖后）
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build api

# 重置数据（⚠️ 会删除 pg/redis/minio 全部本地数据卷）
docker compose --env-file .env -f deploy/docker-compose.yml down -v

# 容器内工具
docker compose -f deploy/docker-compose.yml exec postgres psql -U openschedule -d openschedule
docker compose -f deploy/docker-compose.yml exec redis redis-cli ping
docker compose -f deploy/docker-compose.yml exec api pnpm exec prisma migrate status
```

## .env 与网络地址约定

- 根目录 `.env` 与 compose 共用：compose 通过 `env_file: ../.env` 把变量传入容器，并通过
  `environment` 覆盖网络相关地址（`localhost` → 服务名：`postgres`/`redis`/`minio`/`api`/`ai`）。
- **因此 `.env` 中保持 `localhost` 写法即可**：本地直接跑服务（方式 B）与容器内（方式 A）互不冲突。
- 浏览器侧地址（`STORAGE_PUBLIC_BASE_URL`、`VITE_API_BASE_URL`）恒为宿主地址，compose 已处理。

### 特殊场景

- **AI 模型**：无需在部署时配置 key，登录后由团队管理员在「设置 → AI 模型」配置（D-14，已移除 LiteLLM）
  （Linux 需 `extra_hosts: ["host.docker.internal:host-gateway"]`，Windows/macOS 开箱即用）。
- **AI 服务回调主服务**：容器内已由 compose 覆盖 `MAIN_SERVICE_INTERNAL_URL=http://api:3000`
  （变量名与 `services/ai/app/config.py` 对齐；本地直接跑时走根 `.env` 的 `localhost` 值）。
- **启用 mailpit**：取消 compose 中 mailpit 注释块，并把 `.env` 的 `SMTP_HOST` 改为 `mailpit`
  （SMTP_PORT 保持 1025），邮件 UI 见 http://localhost:8025。

## 初始化与迁移

- **postgres 初始化脚本**：`deploy/postgres/init/001-extensions.sql`（创建 pg_trgm/pgcrypto 扩展）
  仅在数据卷**首次**初始化时执行；修改后需 `down -v` 重建（会清空数据）。
- **数据库结构**：DDL 唯一权威来源为 `services/api/prisma/schema.prisma`（方案 chapter_02 §2）。API 启动不执行 DDL；迁移必须作为独立步骤显式执行：
  `pnpm prisma:deploy`、`pnpm prisma:status`、`pnpm prisma:diff`。
  生产发布顺序为先备份、再 `prisma migrate deploy`、再启动/放流量；禁止依赖应用启动副作用或 `db push`。
- **MinIO bucket**：`STORAGE_BUCKET=openschedule`，由 api 启动时自动创建（对象存储适配器负责）；
  如需手动创建：`docker compose exec minio mc mb local/openschedule`（镜像含 mc 时）。

## 可观测性栈（R9）

API 暴露 Prometheus 指标（`GET /metrics`，排除 `/api/v1` 前缀；`METRICS_ENABLED=false` 时返回 404）：

| 指标 | 含义 |
|------|------|
| `openschedule_http_requests_total{method,route,status}` | 请求计数（RED 的 Rate/Errors） |
| `openschedule_http_request_duration_seconds{…}` | 请求耗时直方图（RED 的 Duration） |
| `openschedule_http_requests_in_flight` | 在途请求数 |
| `openschedule_db_slow_queries_total{model,operation}` | 超过 `SLOW_QUERY_MS` 的查询计数（与 `db_slow_query` 日志同源） |
| `openschedule_system_events_total{event}` | 系统级事件（如 `redis_degraded`） |
| `openschedule_process_*` / `openschedule_nodejs_*` | Node 运行时默认指标 |

```bash
pnpm docker:obs                                   # 起 Prometheus(9090) + Grafana(3001)
curl -s localhost:3000/metrics | head -20         # 本地直连 API 时
```

- 抓取配置：`deploy/observability/prometheus.yml`（job `openschedule-api`，目标 `api:3000`，15s）。
- 告警规则：`deploy/observability/alerts.yml`（ApiDown / ApiHighErrorRate / ApiHighLatencyP95 /
  ApiInFlightSaturation / DbSlowQuerySpike / RedisDegraded / ApiEventLoopLagHigh / ApiHeapUsedHigh）。
  未配置 Alertmanager 时规则仅处于 firing 状态，可在 Prometheus UI → Alerts 查看。
- 看板：`deploy/observability/grafana/dashboards/openschedule-api.json`（随 provisioning 自动加载）。
- 错误上报：`SENTRY_DSN` 配置后，`ExceptionFilter` 把 5xx 以 Sentry Envelope 直连上报（零依赖实现，
  见 `services/api/src/common/observability/sentry.ts`）；留空则完全 no-op。

## 备份与恢复演练（R1）

数据库凭据只通过 `DATABASE_URL` 传入，脚本不会把凭据写入仓库：

```bash
# Linux/macOS/CI
export DATABASE_URL='postgresql://...'
deploy/postgres/backup.sh backups/openschedule.dump
deploy/postgres/restore.sh backups/openschedule.dump 'postgresql://.../openschedule_restore'
deploy/postgres/verify-restore.sh
```

Windows PowerShell 使用 `deploy/postgres/backup.ps1`、`restore.ps1`、`verify-restore.ps1`。恢复必须针对隔离数据库；验证至少确认 `tenants`、`tasks`、`ai_proposal_tasks`、`audit_logs` 存在并完成关键数据校验。Redis 可重建，不作为 PostgreSQL 备份对象。


- postgres/redis/minio 在 compose 内配置 healthcheck；api/web/ai 的 healthcheck 在各自 Dockerfile 内
  （均探活 `/health`，B1 验收点）。`web`/`ai` 通过 `depends_on: api.condition: service_healthy` 等待主后端就绪。
- ⚠️ 三个应用服务的 `/health` 端点由对应模块同事实现；未实现前容器会显示 `unhealthy` 且 web/ai 不启动，
  属预期行为（B1 交付后全绿）。

## 生产部署（R10；ADR D-02 = A 单机 compose 分层）

开发栈（本文件其它章节）与生产栈**分层分离**，互不叠加：

| 文件 | 用途 |
|------|------|
| `deploy/docker-compose.yml` | 本地开发（源码挂载/dev server/宿主端口全开） |
| `deploy/docker-compose.prod.yml` | **生产**：仅 caddy 对外 80/443；pg/redis/minio/api/ai 不暴露端口；镜像按不可变 tag 拉取 |
| `deploy/caddy/Caddyfile` | 唯一入口：TLS 自动签发 + `/api/*`→api、`/metrics`→403、其余→web |
| `deploy/web/nginx.conf` | 前端静态托管（SPA 回退 + 指纹资源长缓存；不做 API 代理） |
| `deploy/observability/alertmanager.yml` + `alert-bridge/` | 告警路由与飞书/钉钉/企业微信通知转发（R9-3） |
| `deploy/.env.production.example` | 生产变量模板（真实值放 `deploy/.env.production`，已被 .gitignore 排除） |
| `deploy/server/bootstrap.sh` / `gen-env.sh` | 服务器一次性初始化（Docker/用户/防火墙/内核参数）与 `.env.production` 生成（R10-3） |
| `docs/ops/runbook.md` | 运维手册：发布/回滚/告警处置/备份恢复演练/密钥清单 |
| `.github/workflows/release.yml` | CD：推 `v*` tag → 构建三镜像 → 迁移 job → staging 自动 → production 人工审批 |

```bash
sudo bash deploy/server/bootstrap.sh --ssh-pubkey "<CI 公钥>"   # 一次性：服务器初始化（Debian/RHEL 系兼容；--check 只自检）
bash deploy/server/gen-env.sh --domain <域名> --email <邮箱> --registry ghcr.io/<org>   # 生成 deploy/.env.production（自动造密钥，只补空值）
COMPOSE="docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml"
$COMPOSE config                                    # 校验编排
$COMPOSE --profile tools run --rm migrate          # 迁移（独立 job；应用不做启动期 DDL）
$COMPOSE up -d --remove-orphans                    # 启动
$COMPOSE --profile observability up -d             # 附加可观测性（Prometheus/Grafana）
$COMPOSE --profile ops up -d pg-backup             # 每日备份 job
```

要点：关键密钥用 `${VAR:?}` 缺失即失败（杜绝 `change-me` 上生产）；`DB_AUTO_MIGRATE=false`；
`METRICS_ENABLED=true`；前端生产镜像用 `prod` 目标（nginx 托管 `apps/web/dist`，构建期锁 `VITE_USE_MOCK=false`）。
门禁：`node --experimental-strip-types tests/qa/deploy-prod-gates.test.ts`。

## 注意事项与 TODO

- `minio/minio:latest`：CI/生产发布前固定 RELEASE tag（生产栈已固定 `RELEASE.2024-10-13T13-34-11Z`；开发栈仍为 latest）。
- 生产编排已落地（R10）：`deploy/docker-compose.prod.yml`（单机 compose，ADR D-02 = A）；`deploy/k8s/` 保留为 P2（超 50 人规模或需多可用区时迁移，见 `docs/ops/runbook.md` §7）。
- AI 模型：开发栈与生产栈都不含模型网关；AI 服务按团队管理员在设置页配置的 OpenAI 兼容端点直连厂商（D-14）。
