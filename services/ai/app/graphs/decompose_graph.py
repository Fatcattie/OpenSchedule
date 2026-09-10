"""LangGraph 图结构占位：plan → validate（重试环）→ emit。

本骨架提供两条运行路径：
1. langgraph 已安装：StateGraph 编译 + ainvoke（正式路径，Phase 3 扩展基础）
2. langgraph 未安装：等价手动流程（保证骨架在任何环境下可跑通）

⚠️ interrupt 审批说明（Phase 3 才启用）：
- decompose 图不需要 interrupt —— 拆解草稿的"AI 提议、人确认"由主服务 ai_proposals 审批门承载
  （approve 单事务落库，§3.1 AI 写库铁律：唯一写库通道）。
- Phase 3 的 execute / emergency-plan 图需要在工具调用/执行前插入人工审批节点，届时使用
  LangGraph interrupt 机制：

      from langgraph.types import interrupt
      approved = interrupt({"type": "tool_approval", "tool": tool_name, "payload": {...}})
      if not approved:  # 拒绝 → 走拒绝分支（拒绝原因回流反哺模型，§3.6 ai.proposal.rejected）
          return {"decision": "rejected"}

  interrupt 会挂起图执行并返回 HumanInTheLoop 状态，主服务经 WS/通知推给审批人，
  审批结果用 Command(resume=...) 恢复执行。本骨架先以注释形式保留该机制说明，
  execute/emergency 图开发时按此接入（工具审批钩子 GET /internal/ai/tool-approvals/:id）。
"""
from __future__ import annotations

import logging
from typing import Any, Literal, TypedDict

from ..config import get_settings
from ..schemas.decompose import DecomposeRequest, DecomposeResult
from ..services.llm_client import generate_plan, template_decompose
from ..services.validator import format_feedback, validate_l1_raw, validate_result

logger = logging.getLogger(__name__)

_MAX_RETRIES_DEFAULT = 3  # §3.5.4：校验失败重试 ≤3 次


class DecomposeState(TypedDict, total=False):
    """拆解图状态（LangGraph StateGraph 的状态 schema）。"""

    run_id: str
    proposal_id: str | None
    request: dict[str, Any]          # DecomposeRequest 的 dict 形态（便于图状态序列化）
    raw_text: str                    # LLM 原始输出
    result: DecomposeResult | None   # 校验通过的结果
    issues: list[str]                # 最近一次校验问题（人类可读）
    feedback: str | None             # 给 LLM 的修正反馈（L1/L2 失败原因）
    retries: int                     # 已重试次数
    max_retries: int                 # 重试上限
    degraded: bool                   # 是否走了降级路径（模板）
    emit_status: Any                 # async (progress:int, stage:str) -> None；运行器注入，驱动 SSE ai.status 帧


async def _emit_status(state: DecomposeState, progress: int, stage: str) -> None:
    """调用运行器注入的状态回调（驱动 SSE ai.status 帧）。"""
    emit = state.get("emit_status")
    if emit is not None:
        await emit(progress, stage)


async def plan_node(state: DecomposeState) -> dict[str, Any]:
    """节点 1（plan）：调用 LLM 生成拆解草稿；LLM 不可用或重试耗尽 → 确定性模板降级。"""
    await _emit_status(state, 20, "planning")
    request = DecomposeRequest.model_validate(state["request"])
    feedback = state.get("feedback")
    force_template = state.get("retries", 0) >= state.get("max_retries", _MAX_RETRIES_DEFAULT)
    raw_text, degraded = await generate_plan(request, feedback=feedback, force_template=force_template)
    return {"raw_text": raw_text, "degraded": degraded}


async def validate_node(state: DecomposeState) -> dict[str, Any]:
    """节点 2（validate）：L1（strict Pydantic）+ L2（判环/孤立/数值/完整性）。失败写 feedback 供 plan 重出。"""
    await _emit_status(state, 60, "validating")
    parsed, l1_issues = validate_l1_raw(state.get("raw_text", ""))
    if parsed is None:
        return {
            "result": None,
            "issues": [issue.message for issue in l1_issues],
            "feedback": format_feedback(l1_issues),
            "retries": state.get("retries", 0) + 1,
        }
    report = validate_result(parsed, get_settings())
    if not report.passed:
        return {
            "result": None,
            "issues": [issue.message for issue in report.issues],
            "feedback": format_feedback(report.issues),
            "retries": state.get("retries", 0) + 1,
        }
    return {"result": parsed, "issues": [], "feedback": None}


async def emit_node(state: DecomposeState) -> dict[str, Any]:
    """节点 3（emit）：产出最终草稿。校验始终未通过（重试耗尽）→ 模板兜底，保证图恒以合法结果终止。"""
    await _emit_status(state, 95, "emitting")
    result = state.get("result")
    degraded = state.get("degraded", False)
    if result is None:
        request = DecomposeRequest.model_validate(state["request"])
        result = template_decompose(request)  # 模板恒通过 L1/L2
        degraded = True
    if degraded:
        warning = "本次拆解经降级路径生成（LLM 不可用或校验未通过），结果仅供参考，请人工核对后确认"
        if warning not in result.warnings:
            result.warnings.append(warning)
    return {"result": result}


def route_after_validate(state: DecomposeState) -> Literal["retry", "emit"]:
    """重试环出口：校验未过且未超重试上限 → 回 plan；否则 → emit（emit 内兜底模板）。"""
    max_retries = state.get("max_retries", _MAX_RETRIES_DEFAULT)
    if state.get("result") is None and state.get("retries", 0) <= max_retries:
        return "retry"
    return "emit"


def build_decompose_graph():
    """编译 LangGraph：plan → validate →(retry|emit)→ emit → END。惰性导入 langgraph。"""
    from langgraph.graph import END, StateGraph  # 惰性导入：未安装时走手动等价流程

    graph = StateGraph(DecomposeState)
    graph.add_node("plan", plan_node)
    graph.add_node("validate", validate_node)
    graph.add_node("emit", emit_node)
    graph.set_entry_point("plan")
    graph.add_edge("plan", "validate")
    graph.add_conditional_edges("validate", route_after_validate, {"retry": "plan", "emit": "emit"})
    graph.add_edge("emit", END)
    return graph.compile()


async def run_decompose_graph(initial: DecomposeState) -> DecomposeState:
    """运行拆解图：优先 langgraph ainvoke；未安装则手动等价流程（plan→validate→…→emit）。"""
    try:
        graph = build_decompose_graph()
        return await graph.ainvoke(initial)
    except ImportError:
        logger.warning("langgraph 未安装，decompose 走手动等价流程（plan→validate→emit）")
        state: dict[str, Any] = dict(initial)
        while True:
            state.update(await plan_node(state))      # type: ignore[arg-type]
            state.update(await validate_node(state))  # type: ignore[arg-type]
            if state.get("result") is not None:
                state.update(await emit_node(state))  # type: ignore[arg-type]
                return state                          # type: ignore[return-value]
            if state.get("retries", 0) > state.get("max_retries", _MAX_RETRIES_DEFAULT):
                state.update(await emit_node(state))  # 重试耗尽：emit 内模板兜底
                return state                          # type: ignore[return-value]
