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
| mailpit（默认关闭） | axllent/mailpit | 1025:1025（SMTP）/ 8025:8025（UI） | 本地邮件收件箱（方案 B1 要求，注释块启用） | — |

## 常用命令（均在仓库根目录执行）

```bash
cp .env.example .env          # 首次必须：环境变量模板（真实凭据不进 git）

# 全栈一键启动（构建并后台运行全部 6 个服务）
pnpm docker:up                # = docker compose --env-file .env -f deploy/docker-compose.yml up -d --build

# 仅基础设施（日常本地开发推荐：容器跑 pg/redis/minio，三服务本地跑）
pnpm docker:infra

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

- **宿主机自建 LiteLLM**：ai 容器内 `localhost` 指向自身，需改 `LITELLM_URL=http://host.docker.internal:4000/v1`
  （Linux 需 `extra_hosts: ["host.docker.internal:host-gateway"]`，Windows/macOS 开箱即用）。
- **AI 服务回调主服务**：容器内已由 compose 覆盖 `MAIN_SERVICE_INTERNAL_URL=http://api:3000`
  （变量名与 `services/ai/app/config.py` 对齐；本地直接跑时走根 `.env` 的 `localhost` 值）。
- **启用 mailpit**：取消 compose 中 mailpit 注释块，并把 `.env` 的 `SMTP_HOST` 改为 `mailpit`
  （SMTP_PORT 保持 1025），邮件 UI 见 http://localhost:8025。

## 初始化与迁移

- **postgres 初始化脚本**：`deploy/postgres/init/001-extensions.sql`（创建 pg_trgm/pgcrypto 扩展）
  仅在数据卷**首次**初始化时执行；修改后需 `down -v` 重建（会清空数据）。
- **数据库结构**：DDL 唯一权威来源为 `services/api/prisma/schema.prisma`（方案 chapter_02 §2）。
  开发环境默认 `DB_AUTO_MIGRATE=true`，api 启动时自动 `migrate deploy`；
  也可手动执行 `pnpm prisma:migrate`（本地）或 `docker compose exec api pnpm exec prisma migrate deploy`（容器）。
- **MinIO bucket**：`STORAGE_BUCKET=openschedule`，由 api 启动时自动创建（对象存储适配器负责）；
  如需手动创建：`docker compose exec minio mc mb local/openschedule`（镜像含 mc 时）。

## 健康检查与依赖顺序

- postgres/redis/minio 在 compose 内配置 healthcheck；api/web/ai 的 healthcheck 在各自 Dockerfile 内
  （均探活 `/health`，B1 验收点）。`web`/`ai` 通过 `depends_on: api.condition: service_healthy` 等待主后端就绪。
- ⚠️ 三个应用服务的 `/health` 端点由对应模块同事实现；未实现前容器会显示 `unhealthy` 且 web/ai 不启动，
  属预期行为（B1 交付后全绿）。

## 注意事项与 TODO

- `minio/minio:latest`：CI/生产发布前固定 RELEASE tag。
- 本目录为开发编排；生产（SaaS/私有化）清单预留 `deploy/k8s/`，见方案 chapter_04 B30（私有化交付准备）。
- 本栈不含 LiteLLM 容器：LLM 网关按部署形态单独运行（云服务或宿主机自建），只通过 `LITELLM_URL` 接入。
