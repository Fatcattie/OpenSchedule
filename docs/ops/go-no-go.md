# 上线 Go / No-Go 门禁核对表（R12）

> 上游依据：`docs/ddd/production-ddd-design.md` §4.1（8 项发布阻断条件）、§4.2 SLO。
> 使用方式：发布前 24h 逐项核对；**任一项为 No-Go 即整体 No-Go**（不得以“其它项已绿”通融）。
> 当前结论：**No-Go**（2026-11-01 复核）——GitHub Actions 首跑已全绿（run `41296521906`，见 `production-progress.md` §R8-13），第 1/3 项转 Go；剩余 3 项 No-Go 依赖目标机/真实环境（生产备份实跑与 RTO / ZAP / 告警实触发与三端 Sentry）。

## 1. §4.1 逐项核对

| # | §4.1 条件 | 证据载体 | 离线状态 | 判定 |
|---|---|---|---|---|
| 1 | 迁移基线入库，CI migration job 绿，空库一键建库验证过 | `.github/workflows/ci.yml` migration job；`deploy/postgres/*.sh`；§R8-7 本机 PG 实测（7 迁移一次到位 + 零漂移） | ✅ CI 首跑通过（2026-11-01，run `41296521906`）：官方 PG16 空库 8 迁移一次到位、`migrate status` 干净、漂移 `No difference detected` | **Go** |
| 2 | §3.3 安全清单全项关闭；渗透/基线扫描（ZAP）通过 | `tests/qa/security-gates`、`tests/security/*`、`tests/authz/*`；R4 阻断项（多实例限流/SSRF 实跑） | ⚠️ 代码与契约绿；**ZAP 扫描未跑** | **No-Go** |
| 3 | 集成测试（租户隔离 ≥5、审计、幂等、apply 原子性）进 CI 全绿 | `tests/authz/tenant-isolation`（5 例）、`tests/security/audit-coverage`、`services/api/test/*.e2e-spec.ts` + CI `migration` job 真实库 | ✅ 离线契约绿；CI `migration` job 真实 PG16 e2e **3 files / 19 tests** 通过（migrations / tenant-isolation / workspace，2026-11-01） | **Go** |
| 4 | 备份策略落地 + **至少一次恢复演练成功** | `deploy/postgres/{backup,restore,verify-restore}.sh`；`docs/ops/runbook.md` §5；`deploy/drill/run.mjs` | ⚠️ **CI 级恢复演练已成功**（2026-11-01：PG16 `pg_dump` → 隔离库 `pg_restore` → `verify-restore.sh`，哨兵行命中）；并修复生产 `pg-backup` 因 `?schema=` 参数必败的缺陷。**未完成：目标机生产 `pg-backup` 定时备份实跑 + 演练 RTO 记录**（CI 为空库，不代表生产数据量） | **No-Go** |
| 5 | 前端 `USE_MOCK` 默认 false、localStorage 演示数据清零、本地模拟点清零 | §R7 全部 DoD + §R8-11 请求层 0 处 `USE_MOCK` + `tests/qa/web-mock-convergence` | ✅ 离线证据齐备 | **Go** |
| 6 | 三端 Sentry 接入、告警规则在 staging 验证触发过 | api `common/observability/sentry.ts`、web `src/lib/errorReporting.ts`、ai `app/services/sentry.py`（三端 Envelope 直连，§R9-3）；`deploy/observability/alerts.yml`（10 条）+ `alertmanager.yml` + `alert-bridge`（IM 通知） | ⚠️ 三端接入代码与单测齐备、通知链路本地端到端通过；**真实 DSN 与 staging 告警实触发（含真实群机器人收到）未做** | **No-Go** |
| 7 | secrets 全量走密钥管理，仓库/compose 无明文 | `deploy/docker-compose.prod.yml` 8 项 `${VAR:?}`；`tests/qa/deploy-prod-gates` 门禁；`.env.production` 已 gitignore | ✅ 离线证据齐备 | **Go** |
| 8 | runbook + 回滚预案（应用回滚 = 镜像 tag 回滚 + 迁移兼容性检查） | `docs/ops/runbook.md`（10 条告警处置 + 恢复演练）、`docs/ops/release-plan.md`（灰度路径/冻结期/决策树/expand-contract 三问） | ✅ 文档与门禁齐备 | **Go** |

**汇总**（2026-11-01）：Go 5 项（#1/#3/#5/#7/#8）· No-Go 3 项（#2/#4/#6）· 待 CI 首跑 0 项。

## 2. §4.2 SLO 证据口径

| SLO | 目标 | 取得方式 | 状态 |
|---|---|---|---|
| 可用性 99.5% | 月 | staging 同构观察 1 周（§R10 验收） | 待环境 |
| API P95 读 <500ms / 写 <800ms | — | `k6` 四链路（`qa-load/`） | 待目标机 |
| 5xx <0.5% | — | `openschedule_http_requests_total`（Prometheus） | 待压测 |
| 通知时延 站内 <5s / 邮件 IM <60s | — | R5 三通道真实投递 | 待厂商环境 |
| 提醒准时 <30s | — | R3 BullMQ 实跑 | 待 Redis |
| AI 成功率 ≥95% / schema 合规 ≥99% | — | C20 离线基线 100/100（§R8-12）；真实模型采样可选门 | 离线 Go / 真实待凭据 |
| RPO ≤24h / RTO ≤4h | — | 备份 + 隔离库恢复演练 RTO 记录 | PG16 恢复路径 CI 已通（空库）；RTO 待目标机演练 |

## 3. 解除 No-Go 的最小动作清单

1. 在目标机跑 `node deploy/drill/run.mjs`（非 `--dry-run`），产出 `verdict=PASS` 报告（覆盖 §4.1 #1/#3/#4）。
2. 用真实 DSN 配 `SENTRY_DSN`/`WEB_SENTRY_DSN`/`AI_SENTRY_DSN` 并人为注入错误确认三端上报；配 `ALERT_*` 群机器人；在 staging 人为注入 Redis 不可用 / 5xx 风暴，确认 10 条规则按预期 firing（覆盖 §4.1 #6、§4.2 告警类）。
3. 跑 `node qa-load/run.mjs --base-url <staging>/api/v1 --vus 20 --duration 2m`，把 `qa-load/evidence/*.md` 贴回本文档与 `production-progress.md`（覆盖 §4.2 API 时延/错误率）。
4. 对 §4.1 #2 执行一次 ZAP 基线扫描（或记录为已接受风险并留档）。
5. 全绿后把本文档结论改为 **Go**，并在 `production-progress.md` 记录发布窗口与 §4.1 判定。

## 4. 已知边界

- 本表**不重复** §4.1 原文含义，只做“条件 → 仓库证据 → 判定”的映射；判定以仓库可复现证据为准，不以口头结论为准。
- CI 首次真跑已于 2026-11-01 在 GitHub Actions 观测（run `41296521906`，7/7 job 绿）；整体结论仍为 No-Go，不得据本表直接发布。
