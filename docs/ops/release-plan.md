# 灰度发布与回滚预案（R12）

> 上游依据：`docs/ddd/production-ddd-design.md` §4.1 门禁、D-08（单机 compose 生产启动）、`docs/ops/runbook.md`（故障处置）、`docs/ops/staging-drill.md`（部署演练）。
> 本文是**发布当天的操作剧本**：谁在什么时候做什么、什么指标一亮就回滚、回滚后如何确认。

## 1. 适用范围与前提

| 项 | 取值 |
|---|---|
| 形态 | 单主机 Docker Compose 生产栈（`deploy/docker-compose.prod.yml`，仅 Caddy 暴露 80/443） |
| 镜像 | `ghcr.io/<REGISTRY>/openschedule-{api,web,ai}:<IMAGE_TAG>`（不可变 tag，回滚=换 tag） |
| 数据库 | 已按 expand/contract 约定迁移（**先加列/后删列**，见 §5），Prisma migrate deploy 由 `migrate` job 承担 |
| 灰度能力 | **单机 compose 的灰度是「进程级」而非「流量级」**：Caddy 静态 upstream。因此见 §3 的两条路径，任选其一并在发布记录中写明所用路径 |
| 前置 | §2 检查表全绿；`deploy/drill/run.mjs` 在 staging 跑过一遍且 `verdict=PASS` |

## 2. 发布前置检查表（发布前 24h 内逐项打勾）

| # | 检查项 | 命令/证据 | 阻断 |
|---|---|---|---|
| 1 | §4.1 门禁逐项核对 | `docs/ops/go-no-go.md`（逐项映射到本仓库证据） | 是 |
| 2 | 目标 tag 的 CI 全绿 | GitHub Actions run（`ci.yml` + `release.yml`） | 是 |
| 3 | 迁移可前滚（空库 + 增量各一次） | `migrate` job 输出（staging 演练报告 `migrate` 步骤） | 是 |
| 4 | 备份可用 + 恢复演练成功 | `restore` 步骤退出码 0 + RTO 秒数 | 是 |
| 5 | 冒烟通过（`/health` 200、首页 200、`/metrics` 403） | staging 演练报告 `smoke` 步骤 | 是 |
| 6 | 压测基线取得（四链路） | `qa-load/evidence/load-*.md`，02/03/04 阈值全绿 | 否（但需附报告） |
| 7 | 首个租户可用 | `node scripts/seed-first-tenant.mjs --members 2 --demo` 幂等通过 | 否 |
| 8 | 告警规则已加载 | Prometheus `/api/v1/rules` 返回 10 条 | 否（建议） |
| 9 | runbook 与本次发布记录模板已就位 | `docs/ops/runbook.md` | 是 |

## 3. 发布阶梯

### 路径 A（推荐：权重灰度，需 Caddy 双 upstream）

1. **T-1d**：staging 全量部署 + 观察窗口（≥24h，最好沿用 §4.1 要求的 1 周同构观察期）。
2. **T0 低峰窗口**（若无可避免，见 §4 冻结期）：
   a. 起 `api-canary`（新 tag，临时 profile，独立端口 3001，README 记录端口占用）；
   b. Caddy 把 `/api/*` 以 5% → 25% → 100% 权重切到 canary（每档观察 ≥10 分钟）；
   c. `web` 与 `ai` 无状态，可在 api 100% 后一次性切换（`web` 需清 CDN/浏览器缓存：`/index.html` 不缓存，`assets/*` 带 hash）。
3. **每档观察指标**（红灯即回滚，见 §4）：
   - `ApiHighErrorRate`（5m）> 阈值
   - `ApiHighLatencyP95`（5m）> 阈值
   - `ApiInFlightSaturation`（5m）
   - `DbSlowQuerySpike`（10m）
   - `RedisDegraded`（15m 窗口内出现 `redis_degraded`）
   - `ApiEventLoopLagHigh`（5m）、`ApiHeapUsedHigh`（10m）、`ApiDown`（1m）
   - `AiCallbackDeadLetters`（15m 内新增死信）、`AiRunStoreDegraded`（AI 状态存储退化 memory）
4. **T0+2h**：发布记录（§6）+ 观察期交班。

### 路径 B（蓝绿：切 `IMAGE_TAG`）

1. 备份 → `migrate` job → 起新 tag 全栈；健康后再切 Caddy upstream 或直接 `up -d`（compose 会滚动替换同名服务）。
2. 旧 tag 镜像**保留不删**（回滚素材）。
3. 观察指标同上；`docker compose ps` 全 healthy 为硬门槛。

## 4. 冻结期、窗口与回滚决策树

**冻结期**：周五 12:00 → 周一 09:00 不发布；节假日与月末结算前后 24h 不发布；发布日不并行做其他变更。

```
发布中/后出现异常
├─ 是否 5xx/错误率超阈（ApiHighErrorRate / ApiDown）？
│   ├─ 是 → 立即回滚（§4.1）
│   └─ 否 ↓
├─ 是否仅性能劣化（P95 / in-flight / eventloop / heap）？
│   ├─ 是且 5 分钟内未回落 → 回滚
│   └─ 否 ↓
├─ 是否数据/迁移相关（DbSlowQuerySpike、迁移失败、字段缺失）？
│   ├─ 是 → 停止推进 → 应用回滚 + 按 runbook §3 数据层处置（expand/contract：旧代码兼容新列，故应用回滚通常不需要回滚库）
│   └─ 否 ↓
└─ 继续观察，记录到发布记录
```

**回滚动作（应用层，唯一标准动作）**

```bash
# 用上一次发布的 tag 覆盖（compose 检测到镜像不同即重建该服务）
IMAGE_TAG=<上一个 tag> docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml up -d api web ai
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml ps   # 全 healthy
node deploy/drill/run.mjs --base-url https://<域名> --skip-rollback                    # 冒烟复验
```

**数据层回滚门槛**：仅当本次发版**删除了列/表**（contract 阶段）才需要数据恢复，且必须先确认「新数据是否已写入被删结构」：
- 已写入 → 用 `deploy/postgres/restore.sh` 恢复到**隔离库**先做一致性核对，再决定是否切生产库；
- 未写入 → 应用回滚即可，不动数据。

> 「回滚 = 镜像 tag 回滚 + 迁移兼容性检查」是本预案的核心约束：**expand/contract 保证旧代码永远能跑新库**，因此应用回滚不需要等库回滚，RTO 以分钟计。这条约束必须在每次发版前由开发确认（前置检查表 #3）。

## 5. 迁移兼容性检查（发布前必须回答的 3 个问题）

1. 本次是否只做 **expand**（加表/加列/加索引，全部 nullable 或带默认值）？→ 是则应用回滚零成本。
2. 是否有 **contract**（删列/改类型）？→ 有则必须排在**下一次**发版，且本次发布记录中显式标注「N+1 版清理」。
3. 新列是否已由旧代码写入？→ 否（旧代码不认识新列，写入方只有新代码）→ 回滚窗口内数据安全。

## 6. 发布记录模板（贴进 `docs/ddd/production-progress.md`）

```
| 项 | 值 |
|---|---|
| 日期/窗口 | 2026-10-20 22:00–23:30（低峰） |
| IMAGE_TAG | v1.3.0 → v1.3.1 |
| 路径 | A（权重灰度 5%→25%→100%）/ B（蓝绿） |
| 灰度各档 | 5%: 10min 绿 · 25%: 10min 绿 · 100%: 绿 |
| 迁移 | expand only（新增 `xxx` nullable 列），无 contract |
| 备份 | dump 体积 xx MB，恢复演练 RTO xx s |
| 压测 | 02/03/04 p95 … ms，failed 0.0x% |
| 告警 | 10 条规则中 0 条触发 |
| 回滚 | 未触发 / 触发（原因、耗时、复验结果） |
| 结论 | 成功 / 回滚成功 / 部分成功（遗留项） |
```

## 7. 沟通与升级

| 阶段 | 动作 |
|---|---|
| 发布前 | 通知影响范围内的用户（停机窗口 ≤ 5 分钟；路径 B 可能 1–2 分钟 502） |
| 发布中 | 每档切换后在群内播报「档位 + 指标 + 是否继续」 |
| 回滚 | 立即播报「已回滚 + 影响面 + 复验结果」；24h 内出事后复盘（含门禁为何未拦住） |
| 事后 | 把新发现写进 `docs/ops/runbook.md` 的故障处置表；若是门禁缺口，补 `tests/qa/**` 断言 |

## 8. 已知边界

- **单机 compose 无法做真正的按用户灰度**：路径 A 是入口权重灰度（同一宿主），路径 B 是蓝绿；两者都不提供用户级灰度的会话粘性。
- **回滚不覆盖数据损坏**：若新版本已经破坏了数据（非结构变更），应用回滚无用，必须走恢复 + 人工核对。
- **无 k8s**：D-02 已定「单机 compose 为生产形态，k8s 列 P2」，故本文不做 k8s 灰度（不可用于 HPA/Ingress 权重）。
