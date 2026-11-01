"""LangGraph 拆解图测试：plan→validate 重试环、降级兜底、路由出口语义。"""
from __future__ import annotations

import json

from app.config import Settings
from app.graphs import decompose_graph
from app.graphs.decompose_graph import (
    DecomposeState,
    emit_node,
    plan_node,
    route_after_validate,
    run_decompose_graph,
    validate_node,
)
from app.schemas.decompose import DecomposeRequest
from app.services.llm_client import template_decompose

VALID_RESULT = {
    "version": "1.0",
    "summary": "两步拆解",
    "tasks": [
        {"title": "根", "description": "", "estimated_hours": 4.0, "priority": "high",
         "parent_idx": None, "deps": [], "reason": "锚定"},
        {"title": "子", "description": "", "estimated_hours": 2.0, "priority": "medium",
         "parent_idx": 0, "deps": [{"prev_idx": 0, "type": "FS", "lag_days": 0}], "reason": "依赖根"},
    ],
    "warnings": [],
}


def _initial(request: DecomposeRequest | None = None, **overrides) -> DecomposeState:
    req = request or DecomposeRequest(tenant_id="t", project_id="p", description="开发一个系统")
    state: DecomposeState = {
        "run_id": "run-1",
        "proposal_id": None,
        "request": req.model_dump(mode="json"),
        "retries": 0,
        "max_retries": 2,
        "degraded": False,
    }
    state.update(overrides)  # type: ignore[typeddict-item]
    return state


# ═══════════════ 路由出口 ═══════════════

class TestRouteAfterValidate:
    def test_retry_when_failed_and_under_limit(self):
        assert route_after_validate({"result": None, "retries": 1, "max_retries": 3}) == "retry"

    def test_emit_when_retries_exhausted(self):
        assert route_after_validate({"result": None, "retries": 4, "max_retries": 3}) == "emit"

    def test_emit_when_result_valid(self):
        assert route_after_validate({"result": object(), "retries": 1, "max_retries": 3}) == "emit"


# ═══════════════ 节点语义 ═══════════════

class TestNodes:
    async def test_plan_node_passes_feedback_and_force_template(self, monkeypatch):
        seen: dict = {}

        async def fake_generate(request, *, feedback=None, force_template=False, llm=None):
            seen["feedback"] = feedback
            seen["force_template"] = force_template
            return json.dumps(VALID_RESULT), False

        monkeypatch.setattr(decompose_graph, "generate_plan", fake_generate)
        out = await plan_node(_initial(feedback="上次失败原因"))
        assert seen == {"feedback": "上次失败原因", "force_template": False}
        assert out["degraded"] is False

    async def test_plan_node_forces_template_after_max_retries(self, monkeypatch):
        seen: dict = {}

        async def fake_generate(request, *, feedback=None, force_template=False, llm=None):
            seen["force_template"] = force_template
            return json.dumps(VALID_RESULT), False

        monkeypatch.setattr(decompose_graph, "generate_plan", fake_generate)
        await plan_node(_initial(retries=2, max_retries=2))
        assert seen["force_template"] is True

    async def test_validate_node_l1_failure_writes_feedback(self):
        out = await validate_node(_initial(raw_text="垃圾输出"))
        assert out["result"] is None
        assert out["retries"] == 1
        assert "L1_JSON_INVALID" in out["feedback"]

    async def test_validate_node_l2_failure_writes_feedback(self, monkeypatch):
        monkeypatch.setattr(decompose_graph, "get_settings", lambda: Settings())
        cyclic = {
            "version": "1.0",
            "summary": "环",
            "tasks": [
                {"title": "A", "description": "", "estimated_hours": 1.0, "reason": "r",
                 "deps": [{"prev_idx": 1, "type": "FS", "lag_days": 0}]},
                {"title": "B", "description": "", "estimated_hours": 1.0, "reason": "r",
                 "deps": [{"prev_idx": 0, "type": "FS", "lag_days": 0}]},
            ],
            "warnings": [],
        }
        out = await validate_node(_initial(raw_text=json.dumps(cyclic)))
        assert out["result"] is None
        assert "L2_CYCLE" in out["feedback"]

    async def test_validate_node_success(self, monkeypatch):
        monkeypatch.setattr(decompose_graph, "get_settings", lambda: Settings())
        out = await validate_node(_initial(raw_text=json.dumps(VALID_RESULT)))
        assert out["result"] is not None
        assert out["feedback"] is None

    async def test_emit_node_template_fallback_when_result_missing(self):
        request = DecomposeRequest(tenant_id="t", project_id="p", description="开发一个系统")
        state = _initial(request, result=None, degraded=False)
        out = await emit_node(state)
        result = out["result"]
        assert result is not None
        assert len(result.tasks) >= 2
        assert any("降级" in w for w in result.warnings)


# ═══════════════ 整图运行 ═══════════════

class TestRunGraph:
    async def test_retry_loop_then_success(self, monkeypatch):
        monkeypatch.setattr(decompose_graph, "get_settings", lambda: Settings())
        feedbacks: list[str | None] = []
        calls = 0

        async def fake_generate(request, *, feedback=None, force_template=False, llm=None):
            nonlocal calls
            calls += 1
            feedbacks.append(feedback)
            if calls == 1:
                return "完全不是 JSON", False
            return json.dumps(VALID_RESULT), False

        monkeypatch.setattr(decompose_graph, "generate_plan", fake_generate)
        final = await run_decompose_graph(_initial(max_retries=3))
        assert final["result"] is not None
        assert final["result"].summary == "两步拆解"
        assert calls == 2
        assert feedbacks[1] is not None  # 第二次重出携带了 L1 修正反馈

    async def test_retry_exhaustion_falls_back_to_template(self, monkeypatch):
        monkeypatch.setattr(decompose_graph, "get_settings", lambda: Settings())
        calls = 0

        async def fake_generate(request, *, feedback=None, force_template=False, llm=None):
            nonlocal calls
            calls += 1
            if force_template:
                return template_decompose(request).model_dump_json(), True
            return "永远非法", False

        monkeypatch.setattr(decompose_graph, "generate_plan", fake_generate)
        final = await run_decompose_graph(_initial(max_retries=1))
        result = final["result"]
        assert result is not None
        assert calls == 2  # 首次失败 + 重试时 force_template 兜底（retries<=max 共 2 次 plan）
        assert any("降级" in w for w in result.warnings)

    async def test_degraded_warning_deduplicated(self, monkeypatch):
        monkeypatch.setattr(decompose_graph, "get_settings", lambda: Settings())
        request = DecomposeRequest(tenant_id="t", project_id="p", description="开发一个系统")
        result = template_decompose(request)  # 模板自带降级 warning
        state = _initial(request, result=result, degraded=True)
        out = await emit_node(state)
        warnings = out["result"].warnings
        assert len([w for w in warnings if "降级" in w]) == 1
