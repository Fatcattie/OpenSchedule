# k6 四链路压测（R12）

> 目的：给「§4.1 上线前」提供**可复现的容量与稳定性证据**。四条链路覆盖鉴权、最高频读、最优锁争用写、状态机写。
> 本目录**不引入任何依赖**：k6 由目标机安装，脚本只依赖 `k6/http` 与 `k6/metrics`（goja 运行时，无 Node API）。

## 1. 四条链路

| # | 脚本 | 覆盖 | 关键面 |
|---|---|---|---|
| 01 | `k6/01-auth.js` | `POST /auth/register` → `POST /auth/login` | 鉴权 + **限流行为**（每 IP 5 次/分钟） |
| 02 | `k6/02-workspace-read.js` | `GET /workspace/{tasks,sops}` + `GET /workspace/directory` | SPA 首屏最高频读 |
| 03 | `k6/03-workspace-write.js` | `PUT /workspace/tasks`（upsert + delete） | **乐观锁 40901 争用面** |
| 04 | `k6/04-task-flow.js` | 建项目 → 建任务 → `PATCH in_progress`(T1) → `complete`(T4) → `reopen`(T9) | 状态机写路径 + 审计副作用的写放大 |

链路 02/03 的 `setup()` 会先播种数据（02 播 50 条任务文档；03 播 1 条并发争用条目），保证读/写都落在**有数据**的面上。

## 2. 阈值口径

所有链路共用（`lib.js::THRESHOLDS`）：

| 指标 | 阈值 | 含义 |
|---|---|---|
| `http_req_duration` | `p(95)<800ms`、`p(99)<2000ms` | 交互式页面的可用性口径 |
| `http_req_failed` | `rate<1%` | 只统计**非预期**状态码（见下） |
| `checks` | `rate>99%` | 脚本级业务断言通过率 |

另有两个**只上报不阻断**的自定义指标，用于观察设计行为：

- `load_throttled`（01）：429 占比——限流生效的直接证据；
- `load_version_conflict`（03）：40901 占比——并发争用的真实强度；
- `load_business_latency`：仅 2xx 的成功延迟（把 429 的极快返回排除在 p95 之外）。

**限流与容量口径（重要）**：`/auth/login` 与 `/auth/register` 受 §3.3 限流保护（每 IP 5 次/分钟，代码内硬编码，无环境开关）。
单机发起压测时 01 链路**必然**产生 429——这是**设计行为不是缺陷**，脚本用 `expectedStatuses(201,429)` 把 429 标记为预期，因此不会污染 `http_req_failed`。

因此：**容量结论以 02/03/04 为准**；01 用于验证「限流确实拦住暴力登录」+ 取成功登录的延迟样本。若要在 staging 压 01 的成功路径，请在**出口 IP 白名单**或反代层放行后重跑，并在报告中注明。

## 3. 运行

```bash
# 静态核验（任何机器，无需 k6 / 无需服务）：语法 + 阈值契约 + k6 运行时纯净度 + 落盘报告
node qa-load/run.mjs --check

# 全量四链路（目标机，需已安装 k6；BASE_URL 指向 staging 的 /api/v1）
node qa-load/run.mjs --base-url https://staging.example.com/api/v1 --vus 20 --duration 2m

# 单链路 / 复用已有租户（避免每次造租户与限流）
node qa-load/run.mjs --chain 02 --vus 50 --duration 3m
node qa-load/run.mjs --email load@example.com --password '***'
```

也可直接用 k6：

```bash
k6 run qa-load/k6/02-workspace-read.js -e BASE_URL=http://localhost:3000/api/v1 -e VUS=10 -e DURATION=30s
```

环境变量：`BASE_URL`、`VUS`（默认 10）、`DURATION`（默认 30s）、`LOAD_EMAIL`/`LOAD_PASSWORD`（复用租户，缺省则 `setup()` 自动注册新租户）。

产物：`qa-load/evidence/load-<ts>.{json,md}` + 每条链路的 `k6-<id>.json`（`--summary-export`）。报告表可直接粘进 `docs/ddd/production-progress.md` 的验证记录。

## 4. 首次真实压测前的最小验证（契约回归）

三条链路都带乐观锁/状态机断言，**先跑单 VU 短时**确认契约无漂移，再放大并发：

```bash
for c in 01 02 03 04; do node qa-load/run.mjs --chain $c --vus 1 --duration 5s; done
```

单 VU 若出现 40001/40902/40901（01 的 429 除外）说明**契约与脚本不一致**，应先修脚本或记录为契约缺陷，再谈容量。
需要真实 API + 数据库：`prisma dev`（PGlite）+ `pnpm --filter ./services/api run dev`。

## 5. 已知边界

- **本仓库开发机无 k6**：`--check` 的静态核验可跑（已落盘证据），真跑数字必须在目标机取得。
- **02 的读链路只在「工作台集合」上压**：报表/甘特/热力图（`/reports/**`）未纳入四链路，属后续可选扩展。
- **数据面增长**：03 每迭代建/删 1 条、04 每迭代建 1 条任务（不删），长时压测会累积数据，建议在 staging 使用专门租户并在结束后清理。
- **不做容量承诺的项**：Auth 成功路径（受限流）、多实例 Redis 一致性（需多实例编排）、文件上传（multipart 属 `qa-e2e/real-multipart-check.mjs` 范围）。
