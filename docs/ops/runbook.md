# OpenSchedule 运维手册（Runbook）

> 批次：R10 生产部署与运维 · 决策：**D-02 = A**（单机 Docker Compose 生产版起步，5–50 人团队规模足够；
> k8s 列 P2）· **D-08 = 云主机 + Docker**（自建 Docker，非 K8s）
> 关联：`deploy/docker-compose.prod.yml`（生产编排）、`deploy/caddy/Caddyfile`（入口/TLS）、
> `deploy/.env.production.example`（密钥清单）、`docs/ddd/production-ddd-design.md` §3.7 / §4.1。

---

## 0. TL;DR 速查

| 场景 | 命令 |
|---|---|
| 发布（CI 正常路径） | 推 `v*` tag → GitHub Actions `Release` → staging 自动 → production 审批后发布 |
| 手动发布到某台机 | 见 §2 发布流程 |
| 回滚应用 | 见 §3 回滚（改 `IMAGE_TAG` 重发，**不回滚迁移**） |
| 看健康 | `curl -fsS https://$DOMAIN/health` |
| 看指标 | 内网 `curl -fsS http://<host>:3000/metrics`（公网 `/metrics` 由 Caddy 拒绝 403） |
| 看板/告警 | Grafana `https://$DOMAIN/grafana/` · Prometheus UI 仅内网（`--profile observability`） |
| 备份 | 常驻 job：`--profile ops up -d pg-backup`（每日一次，保留 14 天） |
| 恢复演练 | 见 §5（`deploy/postgres/restore.sh` + `verify-restore.sh`） |
| 紧急停服 | `docker compose -f deploy/docker-compose.prod.yml stop caddy api web ai` |

---

## 1. 拓扑与端口

```
                 Internet
                    │ 80/443
              ┌─────▼─────┐        ┌──────────────┐
              │   caddy   │───────▶│  web (nginx) │  静态 SPA
              │ TLS 终结  │        └──────────────┘
              │           │        ┌──────────────┐
              │           │───────▶│  api :3000   │  NestJS（唯一写库方）
              │           │        └───┬──────┬───┘
              │           │            │      │
              │           │      ┌─────▼──┐ ┌─▼──────┐  ┌────────────┐
              │           │      │postgres│ │ redis  │  │ minio :9000│
              │           │      └────────┘ └────────┘  └────────────┘
              │           │        ┌──────────────┐
              │           │───────▶│   ai :8300   │──▶ 模型厂商（租户配置）
              └───────────┘        └──────────────┘
```

- **唯一对外端口**：caddy 的 `80/443`。pg/redis/minio/api/ai/prometheus/grafana **均不映射宿主端口**。
- Prometheus 在 compose 网络内直连 `api:3000/metrics`（公网访问 `/metrics` → 403）。
- 服务名即 DNS：`postgres` / `redis` / `minio` / `api` / `web` / `ai` / `grafana` / `prometheus` / `alertmanager` / `alert-bridge`。

---

## 2. 发布流程（标准）

**前置（一次性，R10-3 脚本化）**
1. 服务器初始化（root，可重复执行；支持 Ubuntu/Debian 与 CentOS Stream/RHEL/Rocky/Alma/Alibaba Cloud Linux/Anolis/OpenCloudOS/TencentOS）：
   ```bash
   sudo bash bootstrap.sh --ssh-pubkey "<CI 部署公钥>" --repo <仓库地址> \
        [--registry-mirror https://<加速地址>]     # 国内机器拉 Docker Hub 基础镜像需要
   sudo bash bootstrap.sh --check                 # 只出检查报告
   ```
   装 Docker + compose ≥ 2.24、日志轮转、部署用户 `deploy`（docker 组 + CI 公钥）、已启用防火墙放行 80/443、`vm.overcommit_memory=1`、小内存建 swap、clone 到 `/home/deploy/openschedule`（即 release.yml 的 `$HOME/openschedule`）。**云安全组需另行放行 80/443/SSH**。
   仓库尚未 clone 时，可先单独把 `deploy/server/bootstrap.sh` 传到服务器执行。
2. 以 `deploy` 用户生成密钥文件：`bash deploy/server/gen-env.sh --domain <域名> --email <邮箱> --registry ghcr.io/<org>`。密钥在服务器本机生成、文件 600；重复执行只补空值，**不会重生成已有密钥**。生成后另存一份到密码管理器（§6）。
3. DNS A 记录指向该机（gen-env 会显示当前解析结果）。

**CI 发布（推荐）**：推 `v0.1.0` tag → `Release` workflow 完成 构建三镜像并推 GHCR → staging 迁移+发布+冒烟 → `production` Environment 审批 → 生产迁移+发布。

**手工发布（CI 不可用时）**
```bash
cd ~/openschedule
git fetch --all --tags && git checkout v0.1.0
export REGISTRY=ghcr.io/<org> IMAGE_TAG=v0.1.0
COMPOSE="docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml"

$COMPOSE pull api web ai          # 1) 拉不可变镜像（生产机不 build）
$COMPOSE --profile tools run --rm migrate   # 2) 迁移（幂等；先于应用滚动）
$COMPOSE up -d --remove-orphans   # 3) 滚动启动
$COMPOSE ps                       # 4) 全部 healthy
curl -fsS https://$DOMAIN/health  # 5) 冒烟
```
**上线顺序不可颠倒**：迁移必须**向后兼容**（expand/contract）——先加列/表，下一版才删。

---

## 3. 回滚

| 层级 | 操作 | 说明 |
|---|---|---|
| 应用（首选） | `IMAGE_TAG=v0.0.9` 重跑 §2 步骤 1/3 | 镜像不可变，秒级回滚；**不要回滚已应用的迁移** |
| 配置 | `git checkout <旧 commit> -- deploy/` 后 `up -d` | 只回滚编排/代理配置 |
| 数据（最后手段） | §5 恢复演练流程，恢复到新库再切 | 会丢恢复点之后的数据，须审批 + 记录事故单 |

回滚后必须复核：`$COMPOSE ps` 全 healthy、`/health` 200、`ApiHighErrorRate` 告警已恢复。

---

## 4. 告警处置表（对应 `deploy/observability/alerts.yml`）

| 告警 | 级别 | 含义 | 第一动作 | 升级 |
|---|---|---|---|---|
| `ApiDown` | critical | Prometheus 抓不到 `/metrics`（进程死/网络断） | `docker compose ps`；`logs --tail=200 api`；必要时 `up -d api` | 5 分钟未恢复 → 回滚上一 `IMAGE_TAG` |
| `ApiHighErrorRate` | critical | 5xx 占比 > 5%（5 分钟） | Sentry 看最新 5xx 栈（只报 5xx）；`logs api \| grep level.:.error` | 单接口集中 → 回滚；全站 → 查 pg/redis 健康 |
| `ApiHighLatencyP95` | warning | p95 > 1s | 看 `db_slow_query` 日志与 `SLOW_QUERY_MS`；查 pg 连接数/慢 SQL | 持续 30 分钟 → 扩 `api` 资源上限或加索引 |
| `ApiInFlightSaturation` | warning | 在途请求持续过高 | 确认是否流量突增；`ApiHeapUsedHigh` 是否同现 | 同现 → 按内存处置；否则限流/扩容 |
| `DbSlowQuerySpike` | warning | 慢查询持续出现 | `grep db_slow_query`；`EXPLAIN ANALYZE` 热点 SQL | 加索引或调 `DB_POOL_MAX` |
| `RedisDegraded` | critical | Redis 不可用，API 降级（有界重连） | `docker compose logs redis`；`redis-cli ping` | 队列/延迟提醒/WS 受影响；恢复前勿重启 api 风暴 |
| `ApiEventLoopLagHigh` | warning | 事件循环 p99 > 0.5s | 查同步阻塞操作/大 JSON 序列化；看 CPU 上限是否打满 | 持续 → 升 `cpus` 上限 |
| `ApiHeapUsedHigh` | warning | Node 堆 > 90% 上限 | `docker stats api`；必要时重启 api（`restart api`） | 反复触发 → 排查泄漏并扩 `memory` |
| `AiCallbackDeadLetters` | critical | AI → 主服务回调重试耗尽/永久 4xx（结果未落库） | `curl -H "Authorization: Bearer $AI_SERVICE_TOKEN" http://ai:8300/ai/dead-letters`；看 `last_error`；修复后逐条 `POST /ai/dead-letters/{id}/replay` | 验签失败（40101）→ 核对两侧 `AI_SERVICE_TOKEN`；主服务 5xx → 先按 `ApiHighErrorRate` 处置 |
| `AiRunStoreDegraded` | warning | AI 的 run/死信退化为 memory（重启丢帧） | `docker compose logs ai \| grep ai_run_store_degraded`；`redis-cli -n 3 ping`；核对 `AI_STATE_REDIS_URL` | 生产须 `AI_RUN_STORE=redis`（fail-fast）；恢复 Redis 后重启 ai 并复查 `/metrics` 的 `mode="redis"` |

> 结构化日志字段：`level` / `requestId` / `traceId` / `route` / `durationMs`；`db_slow_query` 事件含 SQL 与耗时。
> 错误上报（Sentry Envelope，零依赖）：api 只发 5xx，含 `requestId`/`traceId` 标签，**不含请求体/请求头**；web 发页面未捕获异常/Promise 拒绝/React 错误边界（`WEB_SENTRY_DSN`，运行时注入 `/runtime-config.js`）；ai 发未捕获异常与拆解中的 `AI_INTERNAL_ERROR`（`AI_SENTRY_DSN`，空则沿用 `SENTRY_DSN`；不含提示词/模型输出）。

**告警通知链路**：Prometheus → `alertmanager:9093`（`deploy/observability/alertmanager.yml`：按 `alertname+service` 分组，critical 每 1h、warning 每 4h 重复，`ApiDown` 抑制同服务其它告警）→ `alert-bridge:9094`（`deploy/observability/alert-bridge/server.mjs`）→ 飞书/钉钉/企业微信群机器人或通用 webhook。
- 配置：在 `deploy/.env.production` 填 `ALERT_FEISHU_WEBHOOK`（+`ALERT_FEISHU_SECRET`）/ `ALERT_DINGTALK_WEBHOOK`（+`ALERT_DINGTALK_SECRET`）/ `ALERT_WECOM_WEBHOOK` / `ALERT_WEBHOOK_URL` 任意组合，`--profile observability up -d alertmanager alert-bridge`。
- 自检：`$COMPOSE exec alert-bridge wget -qO- http://127.0.0.1:9094/health` 应列出已配置通道；投递失败看 `logs alert-bridge` 的 `alert_bridge_dispatch`（任一通道失败返回 502，Alertmanager 自动重试）。
- 群机器人若开启「关键词」校验，关键词填「告警」或「恢复」（消息标题固定含其一）。

---

## 5. 备份与恢复演练

**备份（自动化）**：`pg-backup` job 每日 `pg_dump --format=custom` 到 `pgbackups` 卷，保留 `BACKUP_RETAIN_DAYS`（默认 14）天。
```bash
COMPOSE="docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml"
$COMPOSE --profile ops up -d pg-backup          # 常驻
$COMPOSE --profile ops exec pg-backup ls -lh /backups   # 查看现存备份
```
**恢复演练（每季度 1 次，务必在隔离库做，禁止直接覆盖生产库）**
```bash
# 0) 取出最新备份到宿主
LATEST=$($COMPOSE --profile ops exec -T pg-backup sh -c 'ls -1t /backups/openschedule-*.dump | head -1')
$COMPOSE --profile ops exec -T pg-backup sh -c "cat $LATEST" > /tmp/drill.dump

# 1) 建隔离库（复用 postgres 容器）
$COMPOSE exec -T postgres psql -U $POSTGRES_USER -d postgres -c 'DROP DATABASE IF EXISTS os_drill; CREATE DATABASE os_drill;'

# 2) 恢复（写入哨兵行 → dump → 隔离库 restore → 校验，脚本与 CI migration job 同源）
export DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/os_drill?schema=public"
bash deploy/postgres/restore.sh /tmp/drill.dump "$DATABASE_URL"
DATABASE_URL="$DATABASE_URL" bash deploy/postgres/verify-restore.sh

# 3) 记录：恢复耗时（RTO 观测）、校验结果、演练人/日期，归档到事故/演练台账
```
**验收标准（Go）**：`verify-restore.sh` 退出码 0（关键表行数与哨兵数据一致），且记录 RTO ≤ 目标值。
**边界**：本机/CI 演练使用 PG16 镜像；PGlite（`prisma dev`）**不能**替代（无 pg_dump/pg_restore）。

---

## 6. 密钥与配置清单（§3.7）

生产**必须**轮换、不得沿用示例值（`deploy/docker-compose.prod.yml` 对关键项用 `${VAR:?}` fail-fast）：

`POSTGRES_PASSWORD` · `MINIO_ROOT_PASSWORD` · `JWT_ACCESS_SECRET` · `JWT_REFRESH_SECRET` · `ENCRYPTION_KEY`（32B base64） · `AI_SERVICE_TOKEN` · `GRAFANA_ADMIN_PASSWORD` · `REGISTRY` / `IMAGE_TAG` / `DOMAIN` / `ACME_EMAIL`

**可选（留空即降级）**：`SENTRY_DSN` / `WEB_SENTRY_DSN` / `AI_SENTRY_DSN`（不报错外发）、`ALERT_*`（告警只在 Prometheus/Alertmanager UI 可见，不推群）、`SMTP_*`（邮件通道显式失败 `EMAIL_ADAPTER_NOT_CONFIGURED`，不影响站内通知）、`VAPID_*`（无 WebPush）。

**AI 模型 key 不在部署配置里**（D-14）：上线后由团队管理员在 Web「设置 → AI 模型」选择厂商（DeepSeek / 智谱 GLM / 通义千问 / Kimi / OpenAI / 自定义 OpenAI 兼容地址）并填写 key，「测试连接」验证后保存；库内 AES-256-GCM 加密（依赖 `ENCRYPTION_KEY`，**轮换 `ENCRYPTION_KEY` 会使已存 key 无法解密，需管理员重新填写**）。未配置时拆解/AI 规则/智能协助回落本地规则引擎。排查：拆解草稿 warnings 会写明 AI 失败原因；`audit_logs` 的 `llm_config.update/delete` 记录谁改过配置（只含 key 末 4 位）。

轮换流程：改 `deploy/.env.production` → `up -d <受影响服务>`（JWT/`ENCRYPTION_KEY` 轮换会使既有会话/密文失效，需评估）。

---

## 7. 容量与资源

单机起点（`deploy/docker-compose.prod.yml` 的 `deploy.resources.limits`）：api 2C/2G · postgres 2C/2G · redis 1C/768M · minio 1C/1G · ai 1C/1G · web/caddy 各 0.5C/256M。
- 所有服务 `restart: unless-stopped` + 健康检查；日志按 `20m × 5` 轮转，防单机磁盘打满。
- 触发扩容的信号：`ApiInFlightSaturation` / `ApiHeapUsedHigh` / `ApiEventLoopLagHigh` 持续告警。
- 单机上限：这是 D-02 的**有意取舍**；超 50 人规模或需多可用区时按 D-08 迁移 k8s（P2）。

---

## 8. 已知边界（诚实记录）

1. **未在真实生产环境跑过**：本仓库环境无 Docker/k8s，`deploy/docker-compose.prod.yml`、`Caddyfile`、`release.yml` 只做了静态校验（YAML/结构/契约门禁），**首次真实发布需按本手册 step-by-step 演练**（同 §R10-1 记录）。
2. 告警通知链路（Alertmanager + alert-bridge）已接线并有本地 HTTP 端到端测试（假机器人），但**真实群机器人投递与 staging 告警实触发尚未验证**；`ALERT_*` 留空时告警仍只触发不推送。
3. `web`/`api`/`ai` 镜像在 CI 构建（`release.yml`），本地无 Docker 时无法校验镜像可构建性。
4. 多实例 Redis 一致性（多副本限流/幂等）未验证；当前按单实例部署。
