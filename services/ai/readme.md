# OpenSchedule AI 服务（services/ai）

FastAPI + LangGraph + LiteLLM 的 AI 能力服务，承载拆解 / 评估 / 应急 / 执行（Phase 1 仅拆解草稿闭环，B12）。

## 铁律（与《开发方案》一致）

1. **AI 永不直连业务库**：本服务没有任何数据库凭据（.env.example 中无 DB 变量）。拆解结果经回调 `POST /internal/ai/results` 交给主服务，由主服务 `ai_proposals` 审批门落库（§3.1：唯一写库通道）。
2. **AI 提议、人确认**：本服务只产出草稿；`approve` 由主服务单事务执行（approved → applied），拒绝原因回流反哺模型（Phase 3）。
3. **strict schema + L1/L2 校验**：Pydantic v2 strict、temperature ≤ 0.2、单次预算上限 `LLM_BUDGET_PER_CALL`（默认 $0.5）、校验失败重试 ≤ 3 次、再失败降级确定性模板（§3.5.4）。

## 目录结构

```
services/ai/
├── pyproject.toml            # 依赖：fastapi/uvicorn/pydantic v2/langgraph/httpx/python-dotenv
├── .env.example              # 环境变量样例（§3.7 LLM 组 + AI 服务专有）
├── README.md
└── app/
    ├── main.py               # FastAPI 入口 + 服务 token 鉴权依赖（全部 /ai/* 挂载）
    ├── config.py             # pydantic-settings 配置类（.env 覆盖）
    ├── schemas/
    │   └── decompose.py      # strict schema：DecomposeRequest / DecomposeResult（= ai_proposals.payload 正式定义，§3.5.2）
    ├── routers/
    │   └── decompose.py      # POST /ai/decompose（202+run_id）→ GET /ai/decompose/{run_id}/stream（SSE）
    ├── services/
    │   ├── llm_client.py     # LiteLLM OpenAI 兼容客户端（≤0.2/超时/错误分类/预算）+ 确定性模板降级
    │   └── validator.py      # L1（strict Pydantic）+ L2（DFS 判环/Kahn 拓扑/孤立/数值/完整性）
    └── graphs/
        └── decompose_graph.py# LangGraph 占位：plan → validate(重试环) → emit；interrupt 审批注释说明
```

## 快速开始

```bash
cd services/ai
python -m venv .venv
.venv/Scripts/activate        # Windows；Linux/macOS 用 source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env          # 按需修改（LITELLM_URL/API_KEY/AI_SERVICE_TOKEN 等）
uvicorn app.main:app --reload --port 8300
```

验证：

```bash
curl http://localhost:8300/health
# → {"status":"ok","service":"openschedule-ai",...}
```

> 不配置 LiteLLM 也能跑通接口：`LITELLM_API_KEY` 留空时自动走**确定性模板拆解**降级路径（同输入同输出，payload 带 warnings 提示）。

## 接口（内部网络 + 服务 token 鉴权）

所有 `/ai/*` 接口要求 `Authorization: Bearer <AI_SERVICE_TOKEN>`（与主服务共享）。

### POST /ai/decompose

请求体（§3.5.2）：

```json
{
  "tenant_id": "租户 uuid",
  "project_id": "项目 uuid",
  "description": "计划描述，如：3 个月内上线一个带看板与提醒的团队任务管理 SaaS",
  "constraints": { "budget_hours": 400, "people": 5, "industry": "软件" },
  "granularity": "中",
  "perspective": "角色"
}
```

- `granularity`：`粗` / `中` / `细`（§3.5.2 原文枚举）
- `perspective`：`时间` / `角色` / `模块`
- 可选头 `X-Proposal-Id`：主服务侧 `ai_proposals` 草稿 id，随 `ai.start`/`ai.done`/回调透传（骨架扩展，便于 run_id ↔ proposal_id 关联）

响应 `202`：

```json
{ "run_id": "uuid", "status": "accepted", "stream_url": "/ai/decompose/{run_id}/stream" }
```

`Location` 头同时携带 stream_url。

### GET /ai/decompose/{run_id}/stream（SSE，§3.5.3）

| 帧 | data | 说明 |
|---|---|---|
| `event: ai.start` | `{run_id, proposal_id}` | 流开始 |
| `event: ai.chunk` | `{"op":"add","path":"/tasks/-","value":{任务}}` 等 | 增量 JSON patch，前端按块渲染 |
| `event: ai.status` | `{progress, stage}` | 阶段进度（planning/validating/emitting） |
| `event: ai.done` | `{proposal_id, payload}` | 完整结构化草稿（严格符合 §3.5.2 schema） |
| `event: ai.error` | `{code, message}` | 失败（含降级路径触发），码：`AI_LLM_*` / `AI_BUDGET_EXCEEDED` / `AI_L1_INVALID` 等 |

断线重连：服务端缓存最近 200 帧（保留 300s），重连先重放再续 live 队列。

## 与主服务对接（时序）

```
主服务                                    AI 服务
   │ 1. 落 ai_proposals(pending)            │
   │ 2. POST /ai/decompose (Bearer token) ──► 202 {run_id}
   │ 3. 代理 SSE /stream/ai ◄── ai.start / ai.chunk / ai.status / ai.done
   │ 4. ◄── POST /internal/ai/results ───────┘ (Idempotency-Key: ai-run:{run_id})
   │      {run_id, proposal_id, status, payload, error?}
   │ 5. 写回草稿 → 用户 diff 确认 → approve 单事务落库（任务树+依赖）
```

- 主服务实现方：`ai-gateway-client`（NestJS 侧），SSE 经 `/stream/ai` 代理（鉴权/审计收口，§4.7 风险 2）。
- 回调 `POST /internal/ai/results` 是**主服务的内部接口**，由主服务提供并鉴权服务 token。
- 幂等：回调带 `Idempotency-Key: ai-run:{run_id}`（§3.1：24h 去重）。

## 降级路径

LLM 不可用 / 超时 / 限流 / 鉴权失败 / 预算超限 / L1-L2 校验失败重试耗尽 → **确定性模板拆解**：

- 行业关键词选模板（软件 / 市场 / 活动 / 通用）× 粒度（任务数）× 视角（时间/角色/模块）→ 同输入同输出（DoD 确定性）
- 根任务 + 链式 FS 依赖子任务，恒通过 L1/L2
- payload 带 `warnings` 提示"模板生成，仅供参考，请人工核对"
- 全程日志留痕（`降级为模板拆解` + 原因）

## 校验器（L1/L2，§3.5.4）

- **L1 格式层**：JSON 提取（容忍 ```json 围栏）→ Pydantic v2 strict 校验；失败反馈重试 ≤ 3 次（`LLM_MAX_RETRIES`）
- **L2 语义层**：
  1. 依赖闭环检测：DFS 三色标记判环（真实实现，返回环路径）+ Kahn 拓扑排序双保险（与主服务落库前校验同源）
  2. 孤立任务检查（无父/无依赖/无子/无被依赖）
  3. 数值范围：估时 (0,1000]、lag_days [0,365]、深度 ≤4（A4）、任务数 ≤10（单次上限）
  4. 完整性核对：规则版（tasks/summary 非空）；LLM 自检 TODO（C20 eval 落地后启用）

## 测试与 eval（TODO，C20）

- [ ] `tests/` 单测：validator 判环/孤立/数值用例集 + schema strict 采样（DoD：100 次采样合规率 ≥99%）
- [ ] 3 模型（DeepSeek/GLM/Qwen）× 拆解 schema × 100 次 eval，定默认模型；改 prompt/schema 重跑回归
- [ ] 确定性测试：同输入两次输出一致（模板路径恒成立；LLM 路径需 temperature=0 + 断言）

## 已知 TODO

- run 注册表为内存态：进程重启丢 run；长任务 + 断线重连需要持久化 run 记录（主服务缓冲策略对齐）
- 回调 best-effort：重试退避 / 死信队列 / HMAC 签名待与主服务 ack 语义对齐
- 月预算告警仅日志：持久化 + 告警通道待接
- 模型单价为示例价（2026-07 聚合）：落地前复核官方价，与 LiteLLM 计费对齐
- `granularity/perspective` 如需 ASCII 枚举（coarse/medium/fine、time/role/module），改 schema 一行别名即可
