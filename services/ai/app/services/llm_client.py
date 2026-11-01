"""OpenAI 兼容客户端（直连租户配置的模型厂商）+ 确定性模板拆解降级路径。

- 端点/key/模型来自租户配置（主服务随请求下发 `LlmTarget`）；DeepSeek/GLM/Qwen/Kimi/OpenAI 均为 OpenAI 兼容
- 调用 /chat/completions；temperature ≤0.2（L1 铁律，§3.5.4）
- 超时/限流/鉴权/上游错误分类；单次预算上限 LLM_BUDGET_PER_CALL（默认 $0.5，§3.5.4）
- LLM 不可用 → template_decompose() 确定性降级（同输入同输出，DoD 确定性要求），保证接口可跑通
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

import httpx

from ..config import Settings, get_settings
from ..schemas.decompose import DecomposeRequest, DecomposeResult, DecomposeTask, LlmTarget, TaskDependency

logger = logging.getLogger(__name__)

# —— 错误码（ai.error 帧用，§3.5.3）——
AI_LLM_UNAVAILABLE = "AI_LLM_UNAVAILABLE"  # 连不上/未配置 → 降级模板
AI_LLM_TIMEOUT = "AI_LLM_TIMEOUT"
AI_LLM_AUTH = "AI_LLM_AUTH"
AI_LLM_RATE_LIMITED = "AI_LLM_RATE_LIMITED"
AI_LLM_INVALID_RESPONSE = "AI_LLM_INVALID_RESPONSE"  # 响应结构不符合 OpenAI 兼容格式
AI_BUDGET_EXCEEDED = "AI_BUDGET_EXCEEDED"
AI_INTERNAL_ERROR = "AI_INTERNAL_ERROR"

# —— 模型单价（美元/百万 token）——
# ⚠️ TODO：落地前复核官方价（§4.7 风险 6：模型单价半年内已调两次）；仅用于单次预算护栏，实际以厂商账单为准
MODEL_PRICES_USD: dict[str, dict[str, float]] = {
    "deepseek": {"input": 0.27, "output": 1.10},
    "glm": {"input": 0.50, "output": 2.00},
    "qwen": {"input": 0.50, "output": 2.00},
}
DEFAULT_PRICE_USD: dict[str, float] = {"input": 0.50, "output": 1.50}

# 进程内累计花费（仅日志告警用；真实月度统计需持久化，TODO）
_monthly_spend_usd: float = 0.0


class LLMError(Exception):
    """LLM 调用错误基类。"""


class LLMConnectionError(LLMError):
    """连不上模型服务（租户未配置/网络不可达）。"""


class LLMTimeoutError(LLMError):
    """请求超时。"""


class LLMAuthError(LLMError):
    """鉴权失败（401/403）。"""


class LLMRateLimitError(LLMError):
    """限流（429）。"""


class LLMUpstreamError(LLMError):
    """上游 5xx 或网络异常。"""


class LLMInvalidResponseError(LLMError):
    """响应结构不符合 OpenAI 兼容格式。"""


class LLMBudgetExceededError(LLMError):
    """单次调用成本超过 LLM_BUDGET_PER_CALL（触发降级路径）。"""


def estimate_cost_usd(model: str, usage: dict[str, Any]) -> float:
    """按 token 数估算单次调用成本（美元）。"""
    lowered = model.lower()
    key = next((prefix for prefix in MODEL_PRICES_USD if prefix in lowered), None)
    price = MODEL_PRICES_USD.get(key, DEFAULT_PRICE_USD) if key else DEFAULT_PRICE_USD
    in_tokens = int(usage.get("prompt_tokens", 0) or 0)
    out_tokens = int(usage.get("completion_tokens", 0) or 0)
    return round((in_tokens * price["input"] + out_tokens * price["output"]) / 1_000_000, 6)


def _record_spend(cost: float, settings: Settings) -> None:
    """累计花费；超过月告警线打日志（TODO：接告警通道 + 持久化月度统计）。"""
    global _monthly_spend_usd
    _monthly_spend_usd += cost
    if settings.llm_monthly_budget_alert > 0 and _monthly_spend_usd > settings.llm_monthly_budget_alert:
        logger.warning(
            "本月 LLM 累计花费 $%.2f 已超过告警线 $%.2f（LLM_MONTHLY_BUDGET_ALERT）",
            _monthly_spend_usd,
            settings.llm_monthly_budget_alert,
        )


@dataclass
class LLMResponse:
    """一次 LLM 调用的标准化响应。"""

    text: str
    model: str
    usage: dict[str, Any]
    cost_usd: float


class LLMClient:
    """OpenAI 兼容客户端（每次运行新建，用后 aclose）。`target` 为租户模型配置；None = 未配置。"""

    def __init__(self, settings: Settings, target: LlmTarget | None) -> None:
        self._settings = settings
        self._target = target
        self._client = httpx.AsyncClient(timeout=settings.llm_timeout_seconds)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def generate(self, *, system: str, user: str, temperature: float | None = None) -> LLMResponse:
        """调用 /chat/completions。错误按类型抛出 LLMError 子类，由调用方决定重试/降级。"""
        settings = self._settings
        target = self._target
        if target is None:
            raise LLMConnectionError("租户未配置模型（降级为模板拆解）")
        model = target.model
        # L1 铁律：temperature ≤ 0.2（配置与入参双保险，超限截断）
        temp = min(temperature if temperature is not None else settings.llm_temperature, 0.2)
        url = target.base_url.rstrip("/") + "/chat/completions"
        payload: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temp,
            "stream": False,
        }
        try:
            resp = await self._client.post(
                url, json=payload, headers={"Authorization": f"Bearer {target.api_key.get_secret_value()}"}
            )
        except httpx.TimeoutException as exc:
            raise LLMTimeoutError(f"LLM 请求超时（{settings.llm_timeout_seconds}s）") from exc
        except httpx.ConnectError as exc:
            raise LLMConnectionError(f"无法连接模型服务：{httpx.URL(url).host}") from exc
        except httpx.HTTPError as exc:
            raise LLMUpstreamError(f"LLM 网络异常：{exc}") from exc

        self._classify_status(resp)

        data = resp.json()
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMInvalidResponseError("LLM 响应缺少 choices[0].message.content") from exc
        usage = data.get("usage") or {}
        cost = estimate_cost_usd(model, usage)
        _record_spend(cost, settings)
        if cost > settings.llm_budget_per_call:
            # 单次预算上限（§3.5.4，默认 $0.5）：超限抛错 → 调用方降级
            raise LLMBudgetExceededError(f"单次调用成本 ${cost:.4f} 超过预算上限 ${settings.llm_budget_per_call}")
        return LLMResponse(text=text, model=data.get("model", model), usage=usage, cost_usd=cost)

    def _classify_status(self, resp: httpx.Response) -> None:
        """HTTP 状态码 → 错误分类（鉴权/限流/上游/其他）。"""
        if resp.status_code in (401, 403):
            raise LLMAuthError(f"LLM 鉴权失败（HTTP {resp.status_code}）")
        if resp.status_code == 429:
            raise LLMRateLimitError("LLM 触发限流（HTTP 429）")
        if resp.status_code >= 500:
            raise LLMUpstreamError(f"LLM 上游错误（HTTP {resp.status_code}）")
        if resp.status_code >= 400:
            raise LLMInvalidResponseError(f"LLM 拒绝请求（HTTP {resp.status_code}：{resp.text[:200]}）")

    # —— 拆解专用 ——
    async def generate_decompose(self, request: DecomposeRequest, feedback: str | None = None) -> str:
        """生成拆解草稿原始文本（JSON）。feedback 携带上次 L1/L2 校验失败原因（重试 ≤3 次）。"""
        user = (
            f"项目/计划描述：{request.description}\n"
            f"约束：{json.dumps(request.constraints.model_dump(), ensure_ascii=False)}\n"
            f"拆解粒度：{request.granularity}；拆解视角：{request.perspective}\n"
        )
        if feedback:
            user += f"\n【上次校验失败，请按以下原因修正后重新输出】\n{feedback}\n"
        resp = await self.generate(system=_SYSTEM_PROMPT, user=user)
        return resp.text


# —— 拆解 system prompt（strict JSON + 规则，§3.5.2/§3.5.5）——
_SYSTEM_PROMPT = """你是 OpenSchedule 的项目拆解顾问。根据用户给出的计划描述，把大计划拆解为可执行的任务草稿。

输出要求（严格）：
1. 只输出一个合法 JSON 对象，不要输出 markdown 代码块、不要任何解释文字。
2. JSON 结构：{"version": "1.0", "summary": 摘要, "tasks": [...], "warnings": [...]}。
3. tasks 每项：{"title", "description", "estimated_hours", "priority", "assignee_hint", "parent_idx", "deps", "reason"}。
4. title：1-200 字；priority：urgent/high/medium/low；estimated_hours：数字，0 < x ≤ 1000，最多 1 位小数。
5. deps 每项：{"prev_idx", "type", "lag_days", "is_shared"}；type ∈ FS/SS/FF/SF；prev_idx 引用 tasks 数组下标；lag_days 非负整数。
6. parent_idx 引用父任务下标，根任务为 null；拆解深度 ≤4 层；任务总数 ≤10（超出请合并，长计划分段 + re-grounding）。
7. 每个任务必须有 reason，说明为什么这样拆、为什么是这个优先级（可解释性）。
8. 依赖禁止自依赖、禁止成环；所有任务必须能从根任务（parent_idx=null 的任务）经父子链到达。
9. assignee_hint 只是建议（角色/人名），不是最终指派——最终指派由人在确认后决定。
10. 你只产出草稿，不落库、不执行；最终以"AI 提议、人确认"为准。
"""


# —— 确定性模板拆解（降级路径）——
# 同一输入永远产出同一结果（DoD：确定性）；供 LLM 不可用/校验失败时兜底，保证接口可跑通。
_TEMPLATES: dict[str, list[dict[str, Any]]] = {
    "software": [
        {"title": "需求调研与范围确认", "hours": 8.0, "hint": "产品", "priority": "high"},
        {"title": "技术方案设计", "hours": 16.0, "hint": "技术负责人", "priority": "high"},
        {"title": "核心功能开发", "hours": 40.0, "hint": "开发", "priority": "high"},
        {"title": "测试与验收", "hours": 12.0, "hint": "测试", "priority": "medium"},
        {"title": "发布与文档沉淀", "hours": 6.0, "hint": "文档/运维", "priority": "medium"},
    ],
    "marketing": [
        {"title": "目标与受众分析", "hours": 6.0, "hint": "策略", "priority": "high"},
        {"title": "内容与物料制作", "hours": 16.0, "hint": "内容", "priority": "high"},
        {"title": "渠道投放执行", "hours": 20.0, "hint": "投放", "priority": "high"},
        {"title": "数据监测与优化", "hours": 10.0, "hint": "数据分析", "priority": "medium"},
        {"title": "复盘报告", "hours": 4.0, "hint": "策略", "priority": "medium"},
    ],
    "event": [
        {"title": "活动策划与预算", "hours": 8.0, "hint": "策划", "priority": "high"},
        {"title": "场地与物料筹备", "hours": 12.0, "hint": "执行", "priority": "high"},
        {"title": "宣传与邀约", "hours": 10.0, "hint": "运营", "priority": "high"},
        {"title": "现场执行", "hours": 16.0, "hint": "执行", "priority": "high"},
        {"title": "活动复盘", "hours": 4.0, "hint": "策划", "priority": "medium"},
    ],
}
_GENERIC_TEMPLATE: list[dict[str, Any]] = [
    {"title": "目标确认与范围梳理", "hours": 6.0, "hint": "负责人", "priority": "high"},
    {"title": "方案制定与对齐", "hours": 10.0, "hint": "负责人", "priority": "high"},
    {"title": "执行实施", "hours": 24.0, "hint": "执行人", "priority": "high"},
    {"title": "检查与验收", "hours": 8.0, "hint": "负责人", "priority": "medium"},
    {"title": "收尾与沉淀", "hours": 4.0, "hint": "负责人", "priority": "medium"},
]
_INDUSTRY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "software": ("软件", "开发", "系统", "app", "网站", "平台", "后端", "前端", "迭代", "产品"),
    "marketing": ("市场", "营销", "运营", "推广", "品牌", "增长", "投放", "渠道"),
    "event": ("活动", "峰会", "展会", "发布会", "沙龙", "团建", "线下"),
}
_TEMPLATE_WARNING = "本次拆解由确定性模板生成（LLM 不可用或校验未通过），结果仅供参考，请人工核对后确认"


def _pick_template(request: DecomposeRequest) -> list[dict[str, Any]]:
    """按行业关键词（描述 + industry 约束）选模板；无命中用通用模板。确定性。"""
    text = (request.description or "") + (request.constraints.industry or "")
    for key, keywords in _INDUSTRY_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            return _TEMPLATES[key]
    return _GENERIC_TEMPLATE


def template_decompose(request: DecomposeRequest) -> DecomposeResult:
    """确定性模板拆解（降级路径）：根任务 + 链式子任务，恒通过 L1/L2。"""
    items = _pick_template(request)
    count_map: dict[str, int] = {"粗": 4, "中": 5, "细": 6}
    items = items[: count_map.get(request.granularity, 5)]

    total = sum(float(item["hours"]) for item in items)
    scale = 1.0
    if request.constraints.budget_hours:
        # 预算缩放（限幅防失真，确定性）
        scale = min(max(request.constraints.budget_hours / total, 0.2), 5.0)

    root_title = (request.description or "").strip()[:40] or "项目整体计划"
    tasks: list[DecomposeTask] = [
        DecomposeTask(
            title=f"{root_title}（整体计划）",
            description=f"「{root_title}」的整体拆解根任务；以下子任务均为其直接子任务。",
            estimated_hours=round(total * scale, 1),
            priority="high",
            parent_idx=None,
            deps=[],
            reason="确定性模板生成：以根任务锚定整个拆解树（计划为第 0 层，A4）。",
        )
    ]
    for idx, item in enumerate(items):
        # 视角处理：时间 → 阶段命名；角色/模块 → 建议人
        title = item["title"] if request.perspective != "时间" else f"阶段{idx + 1}：{item['title']}"
        hint = item["hint"] if request.perspective == "角色" else None
        # 链式依赖：子任务 idx+1 依赖前一个数组元素（idx=0 时依赖根任务 0）
        deps = [TaskDependency(prev_idx=idx, type="FS", lag_days=0, is_shared=False)]
        tasks.append(
            DecomposeTask(
                title=title,
                description=f"（模板）{item['title']}，属于「{root_title}」拆解的一部分。",
                estimated_hours=round(max(float(item["hours"]) * scale, 0.5), 1),
                priority=item["priority"],
                assignee_hint=hint,
                parent_idx=0,
                deps=deps,
                reason="确定性模板生成（LLM 降级路径）：按行业模板顺序串行推进，建议人工核对后确认。",
            )
        )
    total_hours = round(sum(task.estimated_hours for task in tasks), 1)
    return DecomposeResult(
        version="1.0",
        summary=f"（模板降级）将「{root_title}」拆解为 {len(tasks)} 项任务，总估时约 {total_hours} 小时。",
        tasks=tasks,
        warnings=[_TEMPLATE_WARNING],
    )


# —— 顶层编排函数（供 graph 节点调用）——
async def generate_plan(
    request: DecomposeRequest,
    *,
    feedback: str | None = None,
    force_template: bool = False,
    llm: LlmTarget | None = None,
) -> tuple[str, bool]:
    """生成拆解草稿文本。返回 (raw_text, degraded)。

    - LLM 可用：调 generate_decompose；校验失败重试由 graph 的 plan→validate 环控制（feedback 传入）
    - 租户未配置/LLM 不可用/预算超限/重试耗尽（force_template）：确定性模板降级，打日志留痕
    """
    if force_template:
        logger.warning("拆解重试次数已耗尽，强制降级为模板拆解")
        return template_decompose(request).model_dump_json(), True
    client = LLMClient(get_settings(), llm)
    try:
        raw = await client.generate_decompose(request, feedback=feedback)
        return raw, False
    except LLMBudgetExceededError as exc:
        logger.warning("LLM 预算超限，降级为模板拆解：%s", exc)
        return template_decompose(request).model_dump_json(), True
    except LLMError as exc:
        logger.warning("LLM 不可用，降级为模板拆解：%s", exc)
        return template_decompose(request).model_dump_json(), True
    finally:
        await client.aclose()
