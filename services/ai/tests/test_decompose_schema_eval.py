"""C20 decompose schema eval —— strict 采样通过率评测（§3.5.4 L1/L2 + §3.5.2 schema）。

目标（规划项）：strict 100 采样通过率 ≥ 99%。
本文件提供两条评测路径：

1) **离线基线（默认执行，环境无关）**：用确定性模板 + 随机种子生成 100 条「LLM 风格」的拆解输出
   （含 ```json 围栏、前后解释文字、数值型 version 等真实形态），逐条过 `extract_json` →
   L1（Pydantic strict）→ L2（判环/结构/孤立/范围/深度/任务数），要求 ≥99% 通过；
   另配负样本集（脏值），要求逐条被**预期错误码**拒绝 —— 这才是 strict 的另一半（能拒）。
   离线路径验证的是 schema/校验器管道的正确性与回归，不代表某个模型的真实合规率。

2) **真实 LLM 采样（可选，`EVAL_LLM=1` + `EVAL_LLM_API_KEY`）**：对 100 条不同输入真跑模型，
   统计「首轮输出直接通过 strict 校验」的比例，写 JSON 报告并按 ≥99% 断言。
   无凭据时自动 skip（当前环境阻塞，见 production-progress §R8-12）。

跑法：
    cd services/ai && uv run pytest tests/test_decompose_schema_eval.py -v
    EVAL_LLM=1 EVAL_REPORT=.eval/llm.json uv run pytest tests/test_decompose_schema_eval.py -v -k llm
"""
from __future__ import annotations

import json
import os
import random
from pathlib import Path

import pytest

from app.config import Settings, get_settings
from app.schemas.decompose import DecomposeRequest, DecomposeResult, DecomposeTask, LlmTarget
from app.services.llm_client import LLMClient, LLMError, template_decompose
from app.services.validator import (
    L1_JSON_INVALID,
    L1_SCHEMA_INVALID,
    L2_CYCLE,
    L2_DEPTH_LIMIT,
    L2_ORPHAN,
    L2_RANGE,
    L2_STRUCTURE,
    L2_TASK_LIMIT,
    validate_l1_raw,
    validate_result,
)

# —— 评测参数 ——
SAMPLE_COUNT = 100
PASS_RATE_THRESHOLD = 0.99
SEED = 20261018

_PRIORITIES = ("urgent", "high", "medium", "low")
_DEP_TYPES = ("FS", "SS", "FF", "SF")
_TITLES = (
    "需求调研与范围澄清",
    "技术方案设计与评审",
    "数据模型与接口定义",
    "核心链路开发",
    "联调与缺陷修复",
    "测试用例与回归",
    "发布与灰度验证",
    "文档沉淀与交接",
    "风险复盘与改进",
    "运营素材准备",
)


def _build_valid_payload(rng: random.Random) -> dict:
    """构造一条 L1+L2 均合法的拆解 payload（形态随 rng 变化，但始终合法）。"""
    task_count = rng.randint(1, 10)
    tasks: list[dict] = [
        {
            "title": f"{rng.choice(_TITLES)}（整体计划）",
            "description": rng.choice(["", "根任务：锚定整体计划范围与验收标准。"]),
            "estimated_hours": rng.choice([8, 8.0, 12.5, 40.0, 0.5, 999.9]),
            "priority": rng.choice(_PRIORITIES),
            "parent_idx": None,
            "deps": [],
            "reason": "以根任务锚定整个拆解树（计划为第 0 层）。",
        }
    ]
    for idx in range(1, task_count):
        # 父子链：前两个子任务挂根任务（深度 1），其余随机挂到已有任务上（深度 ≤3，满足 ≤4）
        parent = 0 if idx <= 2 else rng.randint(0, idx - 1)
        deps: list[dict] = []
        if rng.random() < 0.75:
            deps.append(
                {
                    "prev_idx": rng.randint(0, idx - 1),  # 只指向前序 → 无环
                    "type": rng.choice(_DEP_TYPES),
                    "lag_days": rng.choice([0, 1, 3, 365]),
                    "is_shared": rng.random() < 0.3,
                }
            )
        task: dict = {
            "title": f"{rng.choice(_TITLES)} {idx}",
            "description": rng.choice(["", "（随机采样）按里程碑推进并留痕。"]),
            "estimated_hours": rng.choice([1, 2.5, 6.0, 16, 24.0, 100.0]),
            "priority": rng.choice(_PRIORITIES),
            "parent_idx": parent,
            "deps": deps,
            "reason": "按拆解树顺序推进；估时与优先级来自经验值，待人工核对。",
        }
        if rng.random() < 0.5:
            task["assignee_hint"] = rng.choice(["产品", "开发", "测试", "运营", "负责人"])
        tasks.append(task)
    payload: dict = {
        "version": rng.choice(["1.0", 1.0]),  # 数值型 version 由 L1 归一化为字符串
        "summary": f"将目标拆解为 {task_count} 项任务，按依赖顺序推进。",
        "tasks": tasks,
        "warnings": rng.choice([[], ["任务粒度偏粗，建议人工细化"]]),
    }
    return payload


def _wrap_like_llm_output(payload: dict, rng: random.Random) -> str:
    """模拟真实 LLM 原始输出形态：裸 JSON / ```json 围栏 / 带前后解释文字。"""
    body = json.dumps(payload, ensure_ascii=False)
    style = rng.choice(["bare", "fenced", "prose_prefix", "prose_both"])
    if style == "bare":
        return body
    if style == "fenced":
        return f"```json\n{body}\n```"
    if style == "prose_prefix":
        return f"好的，以下是拆解结果：\n{body}"
    return f"这是拆解草稿（仅供确认）：\n```json\n{body}\n```\n如需调整请告知。"


def _run_single_sample(raw: str, settings: Settings) -> tuple[bool, str]:
    """单样本：extract_json → L1 strict → L2 语义。返回 (是否通过, 失败原因)。"""
    result, l1_issues = validate_l1_raw(raw)
    if result is None:
        return False, f"L1: {'; '.join(i.code for i in l1_issues)}"
    report = validate_result(result, settings)
    if not report.passed:
        return False, f"L2: {'; '.join(i.code for i in report.issues)}"
    return True, ""


# ═══════════════ 1) 离线基线：100 采样 strict 通过率 ═══════════════


def test_offline_corpus_100_samples_meet_strict_threshold() -> None:
    """离线基线：100 条合法形态样本须 ≥99% 通过 L1(strict) + L2。"""
    settings = Settings()
    rng = random.Random(SEED)
    passed = 0
    failures: list[str] = []
    for i in range(SAMPLE_COUNT):
        payload = _build_valid_payload(rng)
        raw = _wrap_like_llm_output(payload, rng)
        ok, reason = _run_single_sample(raw, settings)
        if ok:
            passed += 1
        else:
            failures.append(f"#{i} tasks={len(payload['tasks'])} {reason}")

    rate = passed / SAMPLE_COUNT
    print(
        f"\n[C20 离线基线] 正样本 {SAMPLE_COUNT} 条 → L1(strict)+L2 通过 {passed} 条"
        f"（{rate:.1%}，阈值 ≥{PASS_RATE_THRESHOLD:.0%}）"
    )
    assert not failures, "离线正样本本应全部通过；失败项：\n" + "\n".join(failures)
    assert rate >= PASS_RATE_THRESHOLD, f"strict 通过率 {rate:.1%} 低于阈值 {PASS_RATE_THRESHOLD:.0%}"


def test_offline_negative_corpus_rejected_with_expected_codes() -> None:
    """strict 的另一半：脏值/非法结构必须被**预期错误码**拒绝（不能宽松放行）。"""
    settings = Settings()
    base = {
        "version": "1.0",
        "summary": "基线",
        "tasks": [
            {
                "title": "根",
                "estimated_hours": 10.0,
                "priority": "high",
                "parent_idx": None,
                "deps": [],
                "reason": "锚定",
            },
            {
                "title": "子",
                "estimated_hours": 5.0,
                "priority": "medium",
                "parent_idx": 0,
                "deps": [{"prev_idx": 0, "type": "FS", "lag_days": 0, "is_shared": False}],
                "reason": "依赖根",
            },
        ],
        "warnings": [],
    }

    def mutate(mutator) -> dict:
        payload = json.loads(json.dumps(base))
        mutator(payload)
        return payload

    cases: list[tuple[str, str, object]] = [
        ("非 JSON 文本", L1_JSON_INVALID, "这不是 JSON"),
        ("估时写成字符串", L1_SCHEMA_INVALID, lambda p: p["tasks"][0].update(estimated_hours="8h")),
        ("缺少 reason", L1_SCHEMA_INVALID, lambda p: p["tasks"][0].pop("reason")),
        ("priority 大写脏值", L1_SCHEMA_INVALID, lambda p: p["tasks"][0].update(priority="HIGH")),
        ("priority 未知枚举", L1_SCHEMA_INVALID, lambda p: p["tasks"][0].update(priority="p0")),
        ("title 超长", L1_SCHEMA_INVALID, lambda p: p["tasks"][0].update(title="x" * 201)),
        ("tasks 为空", L1_SCHEMA_INVALID, lambda p: p.update(tasks=[])),
        ("dep.type 未知", L1_SCHEMA_INVALID, lambda p: p["tasks"][1]["deps"][0].update(type="XX")),
        ("依赖成环", L2_CYCLE, lambda p: p["tasks"][0]["deps"].append({"prev_idx": 1})),
        ("自依赖", L2_STRUCTURE, lambda p: p["tasks"][1]["deps"].append({"prev_idx": 1})),
        ("deps 下标越界", L2_STRUCTURE, lambda p: p["tasks"][1]["deps"].append({"prev_idx": 9})),
        ("孤立任务", L2_ORPHAN, lambda p: p["tasks"].append(
            {
                "title": "孤立",
                "estimated_hours": 3.0,
                "priority": "low",
                "parent_idx": None,
                "deps": [],
                "reason": "无关联",
            }
        )),
        ("估时越界 0（schema 层拦截）", L1_SCHEMA_INVALID, lambda p: p["tasks"][0].update(estimated_hours=0)),
        (
            "lag_days 越界（schema 层拦截）",
            L1_SCHEMA_INVALID,
            lambda p: p["tasks"][1]["deps"][0].update(lag_days=400),
        ),
        (
            "深度超限（>4 层）",
            L2_DEPTH_LIMIT,
            lambda p: p.update(
                tasks=[
                    p["tasks"][0],
                    *[
                        {
                            "title": f"层级{i}",
                            "estimated_hours": 1.0,
                            "priority": "low",
                            "parent_idx": i,  # 链式父：0→1→2→3→4→5（#5 深度 5）
                            "deps": [],
                            "reason": "深度用例",
                        }
                        for i in range(5)
                    ],
                ]
            ),
        ),
        (
            "任务数超限",
            L2_TASK_LIMIT,
            lambda p: p.update(
                tasks=[
                    *p["tasks"],
                    *[
                        {
                            "title": f"额外{i}",
                            "estimated_hours": 1.0,
                            "priority": "low",
                            "parent_idx": 0,
                            "deps": [],
                            "reason": "补充",
                        }
                        for i in range(20)
                    ],
                ]
            ),
        ),
    ]

    for name, expected_code, mutation in cases:
        if callable(mutation):
            payload = mutate(mutation)
            raw = json.dumps(payload, ensure_ascii=False)
        else:
            raw = str(mutation)
        result, l1_issues = validate_l1_raw(raw)
        if result is None:
            codes = {i.code for i in l1_issues}
        else:
            codes = {i.code for i in validate_result(result, settings).issues}
        assert expected_code in codes, f"「{name}」应报 {expected_code}，实际 {sorted(codes) or '（无问题）'}"


def test_l2_range_is_defense_in_depth() -> None:
    """L2 数值范围是 L1 之外的**防御层**：绕过 pydantic 构造的越界值也必须被 L2 拒绝。

    （estimated_hours/lag_days 在 schema 层已有 gt/le 约束，故常规脏值在 L1 即被拦；
    本用例用 model_construct 直接构造非法对象，验证 L2 不会因“L1 已拦”而形同虚设。）
    """
    settings = Settings()
    task = DecomposeTask.model_construct(
        title="越界",
        description="",
        estimated_hours=0.0,
        priority="medium",
        assignee_hint=None,
        parent_idx=None,
        deps=[],
        reason="防御层用例",
    )
    result = DecomposeResult.model_construct(version="1.0", summary="s", tasks=[task], warnings=[])
    codes = {i.code for i in validate_result(result, settings).issues}
    assert L2_RANGE in codes, f"L2 应拦截越界估时，实际 {sorted(codes)}"


def test_offline_template_fallback_always_passes_strict() -> None:
    """降级路径（确定性模板）在任何粒度/视角/约束组合下都必须直接通过 L1+L2。"""
    settings = Settings()
    for granularity in ("粗", "中", "细"):
        for perspective in ("时间", "角色", "模块"):
            for budget in (None, 20.0, 200.0):
                request = DecomposeRequest(
                    tenant_id="t1",
                    project_id="p1",
                    description="软件平台一期建设",
                    constraints={"budget_hours": budget} if budget else {},
                    granularity=granularity,  # type: ignore[arg-type]
                    perspective=perspective,  # type: ignore[arg-type]
                )
                raw = template_decompose(request).model_dump_json()
                ok, reason = _run_single_sample(raw, settings)
                assert ok, f"模板降级未通过 strict（{granularity}/{perspective}/{budget}）：{reason}"


# ═══════════════ 2) 真实 LLM 采样（可选） ═══════════════


def _llm_eval_enabled() -> bool:
    return os.environ.get("EVAL_LLM") == "1"


def _write_report(report: dict) -> Path:
    """写评测报告（同步辅助函数：避免在 async 用例里调用 pathlib）。"""
    report_path = Path(os.environ.get("EVAL_REPORT", ".eval/decompose-schema-eval.json"))
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report_path


@pytest.mark.skipif(
    not _llm_eval_enabled(),
    reason="真实 LLM 采样需 EVAL_LLM=1 + EVAL_LLM_API_KEY（无凭据环境自动跳过，见 §R8-12）",
)
async def test_llm_sampling_strict_pass_rate() -> None:
    """对 100 条不同输入真跑模型，统计首轮输出直接通过 strict 校验的比例（阈值 ≥99%）。"""
    settings = get_settings()
    api_key = os.environ.get("EVAL_LLM_API_KEY", "")
    if not api_key:
        pytest.skip("EVAL_LLM_API_KEY 未配置：无法进行真实 LLM 采样")
    target = LlmTarget(
        base_url=os.environ.get("EVAL_LLM_BASE_URL", "https://api.deepseek.com/v1"),
        api_key=api_key,
        model=os.environ.get("EVAL_LLM_MODEL", "deepseek-chat"),
    )

    rng = random.Random(SEED)
    scenarios = [
        "为团队做一次版本迭代规划",
        "筹备一场 200 人线下发布会",
        "搭建数据看板并接入埋点",
        "上线会员体系的增长活动",
        "完成一次系统安全加固",
    ]
    client = LLMClient(settings, target)
    passed = 0
    costs = 0.0
    failures: list[str] = []
    try:
        for i in range(SAMPLE_COUNT):
            request = DecomposeRequest(
                tenant_id="eval-tenant",
                project_id="eval-project",
                description=f"{rng.choice(scenarios)}（样本 #{i}，粒度 {rng.choice(['粗', '中', '细'])}）",
                granularity=rng.choice(["粗", "中", "细"]),  # type: ignore[arg-type]
                perspective=rng.choice(["时间", "角色", "模块"]),  # type: ignore[arg-type]
            )
            try:
                raw = await client.generate_decompose(request)
            except LLMError as exc:  # 调用失败按未通过计入（真实合规率的一部分）
                failures.append(f"#{i} 调用失败：{exc}")
                continue
            ok, reason = _run_single_sample(raw, settings)
            if ok:
                passed += 1
            else:
                failures.append(f"#{i} {reason}")
    finally:
        await client.aclose()

    rate = passed / SAMPLE_COUNT
    report = {
        "sample_count": SAMPLE_COUNT,
        "passed": passed,
        "pass_rate": round(rate, 4),
        "threshold": PASS_RATE_THRESHOLD,
        "passed_gate": rate >= PASS_RATE_THRESHOLD,
        "model": target.model,
        "failures": failures[:20],
        "estimated_cost_usd": round(costs, 6),
    }
    report_path = _write_report(report)
    print(f"\n[C20 LLM 采样] 通过 {passed}/{SAMPLE_COUNT}（{rate:.1%}）→ 报告 {report_path}")
    assert rate >= PASS_RATE_THRESHOLD, f"LLM strict 通过率 {rate:.1%} 低于阈值 {PASS_RATE_THRESHOLD:.0%}"
