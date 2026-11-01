# staging 首次部署演练（R10-2）

> 目的：R10-1 已经把生产编排写好，但**一次都没跑过**。本演练在真实 Docker 主机上把「迁移 → 起栈 → 冒烟 → 备份 → 隔离库恢复 → 回滚」跑一遍，产出可粘贴的证据，
> 一次性关闭 §4.1 的三个"从未实跑"阻断项：#1（迁移/空库建库）、#3（集成冒烟）、#4（**至少一次恢复演练成功**）。
> 编排脚本：`deploy/drill/run.mjs`；报告：`deploy/drill/evidence/drill-<ts>.{json,md}`。

## 1. 前置条件

| 项 | 要求 |
|---|---|
| 主机 | 一台带 **Docker Engine ≥ 26 + compose v2** 的 Linux 机器（staging 即可，不需要域名证书成功——见 `--base-url`） |
| 仓库 | `git clone` 到 `~/openschedule`（演练脚本用相对路径定位编排文件） |
| 变量 | `cp deploy/.env.production.example deploy/.env.production` 并填齐 **[必填]**（9 类密钥）；CI 场景可先 `--allow-empty-secrets` 只验编排 |
| 端口 | 80/443 空闲；若域名尚未解析，用 `--base-url http://localhost` 跳过 TLS（Caddy 仍会尝试签发证书） |
| 镜像 | 已接 GHCR 就 `pull`；未接则加 `--build` 本地构建（`web` 用 `prod` 目标） |

## 2. 执行

```bash
# ① 静态检查（任何机器都能跑，不需要 Docker）：文件/变量/计划
node deploy/drill/run.mjs --dry-run --env-file deploy/.env.production.example --allow-empty-secrets

# ② 真跑（Docker 主机，仓库根目录）
node deploy/drill/run.mjs --build --base-url http://localhost --rollback-tag v0.0.9
#   无 GHCR  → --build；已有旧版本可回滚 → --rollback-tag <旧 tag>（否则 --skip-rollback）
```

步骤与退出码：11 步，任一**关键**步骤失败即中止（`config`/`images`/`migrate`/`up`/`ps`/`smoke`/`restore` 为关键），报告仍会写出失败明细；退出码 0 = 全部通过。

## 3. 演练会产出什么证据

| 步骤 | 关闭的门禁 | 证据形态 |
|---|---|---|
| `config` | §4.1 #1（编排可解析） | `docker compose config --quiet` 退出码 0 |
| `migrate` | **§4.1 #1**（空库/增量 `migrate deploy` 一次到位 + `migrate status` 干净） | migrate job 完整输出（含迁移条数/状态） |
| `ps` | 部署可用性 | 全部服务 healthy 列表 |
| `smoke` | **§4.1 #3**（真实栈冒烟） | `/health` 200 + 首页 200 + **公网 `/metrics` 403** |
| `backup` | §4.1 #4 前半 | 容器内 `os-backup.sh` 产出的 dump 与体积 |
| `restore` | **§4.1 #4 后半（硬阻断）** | 隔离库 `os_drill` 恢复 + `verify-restore.sh` 退出码 0 + **RTO 秒数** |
| `rollback` | 回滚预案（§4.1 #8 的实操验证） | 旧 `IMAGE_TAG` 滚动结果 + 切回结果 |

## 4. 报告 → 进度文档（粘贴模板）

演练报告 md 末尾自动生成一节「粘贴进 production-progress 的证据模板」，格式即该文档的 `验证记录` 表所需。示例：

```
2026-10-18 | migrate | ok（38.2s）
2026-10-18 | ps | ok
2026-10-18 | smoke | ok
2026-10-18 | restore | ok（12.4s）   ← RTO
2026-10-18 | rollback | ok
```

随后把 §4.1 对应项在 `docs/ops/go-no-go.md`（逐项核对表）中更新判定，并在 `production-progress.md` 的 **§R10-2** 记录本次演练的 `verdict=PASS` 与报告路径。

## 5. 已知边界

- **本仓库开发机无 Docker**：演练脚本在此只有 `--dry-run` 证据（静态前置 + 计划 + 报告结构）；真跑必须在目标机执行。
- **不覆盖**：§4.1 #2（ZAP 扫描）、#6（三端 Sentry + 告警在 staging 触发）——见 §R10-3 / §R9-3 记录。
- **TLS**：域名未解析时 Caddy 无法签发证书，此时用 `--base-url http://localhost` 只验证 80 端口链路；**证书签发需在域名就绪后单独验证一次**。
- **数据**：演练会在 postgres 容器内建 `os_drill` 隔离库并写入备份恢复数据；**不触碰生产库**，但请勿在真实生产实例上执行 `--build`（会覆盖运行中镜像）。
