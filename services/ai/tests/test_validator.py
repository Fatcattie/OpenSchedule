"""L1/L2 校验器测试（§3.5.4）：JSON 提取、strict schema、判环/拓扑、结构/孤立/数值/深度。"""
from __future__ import annotations

import json

from app.config import Settings
from app.schemas.decompose import DecomposeResult, DecomposeTask, TaskDependency
from app.services.validator import (
    L1_JSON_INVALID,
    L1_SCHEMA_INVALID,
    L2_CYCLE,
    L2_DEPTH_LIMIT,
    L2_ORPHAN,
    L2_STRUCTURE,
    L2_TASK_LIMIT,
    _check_orphans,
    _compute_depths,
    _detect_cycle_dfs,
    extract_json,
    format_feedback,
    topological_sort,
    validate_l1_raw,
    validate_result,
)


def _valid_result_dict() -> dict:
    return {
        "version": "1.0",
        "summary": "拆解为两步",
        "tasks": [
            {
                "title": "根任务",
                "description": "",
                "estimated_hours": 10.0,
                "priority": "high",
                "parent_idx": None,
                "deps": [],
                "reason": "锚定整体计划",
            },
            {
                "title": "子任务",
                "description": "",
                "estimated_hours": 5.0,
                "priority": "medium",
                "parent_idx": 0,
                "deps": [{"prev_idx": 0, "type": "FS", "lag_days": 0}],
                "reason": "依赖根任务完成后开始",
            },
        ],
        "warnings": [],
    }


def _task(idx: int, **overrides) -> DecomposeTask:
    """model_construct 绕过校验，专门用于构造非法值测 L2（schema 层已挡住的场景）。
    deps 传 dict 列表时手动物化为 TaskDependency（model_construct 不做嵌套转换）。"""
    base = {
        "title": f"任务{idx}",
        "description": "",
        "estimated_hours": 1.0,
        "priority": "medium",
        "parent_idx": None,
        "deps": [],
        "reason": "r",
    }
    base.update(overrides)
    base["deps"] = [
        d if isinstance(d, TaskDependency) else TaskDependency.model_validate(d)
        for d in base["deps"]
    ]
    return DecomposeTask.model_construct(**base)


def _result(tasks: list[DecomposeTask]) -> DecomposeResult:
    return DecomposeResult.model_construct(version="1.0", summary="s", tasks=tasks, warnings=[])


# ═══════════════ extract_json ═══════════════

class TestExtractJson:
    def test_plain_json_passthrough(self):
        assert extract_json('{"a": 1}') == '{"a": 1}'

    def test_markdown_fence_stripped(self):
        raw = '```json\n{"a": 1}\n```'
        assert extract_json(raw) == '{"a": 1}'

    def test_surrounding_prose_trimmed(self):
        raw = '好的，这是结果：\n{"a": 1}\n以上。'
        assert extract_json(raw) == '{"a": 1}'

    def test_empty_and_jsonless_return_none(self):
        assert extract_json("") is None
        assert extract_json(None) is None
        assert extract_json("没有任何 JSON 的文字") is None


# ═══════════════ L1 ═══════════════

class TestValidateL1:
    def test_invalid_json_returns_l1_issue(self):
        result, issues = validate_l1_raw("这不是 JSON")
        assert result is None
        assert [i.code for i in issues] == [L1_JSON_INVALID]

    def test_top_level_non_dict_rejected(self):
        result, issues = validate_l1_raw("[1, 2, 3]")
        assert result is None
        assert [i.code for i in issues] == [L1_JSON_INVALID]
        assert "顶层必须是对象" in issues[0].message

    def test_numeric_version_normalized_to_string(self):
        data = _valid_result_dict()
        data["version"] = 1.0  # LLM 常输出数值版本号
        result, issues = validate_l1_raw(json.dumps(data))
        assert issues == []
        assert result is not None
        assert result.version == "1.0"

    def test_schema_violation_reports_loc(self):
        data = _valid_result_dict()
        del data["tasks"][0]["title"]
        result, issues = validate_l1_raw(json.dumps(data))
        assert result is None
        assert all(i.code == L1_SCHEMA_INVALID for i in issues)
        assert any("tasks.0.title" in i.message for i in issues)

    def test_strict_schema_rejects_coercion(self):
        data = _valid_result_dict()
        data["tasks"][0]["estimated_hours"] = "8h"  # strict：字符串不转数值
        result, issues = validate_l1_raw(json.dumps(data))
        assert result is None
        assert [i.code for i in issues] == [L1_SCHEMA_INVALID]


# ═══════════════ 判环 / 拓扑 ═══════════════

class TestCycleDetection:
    def test_direct_cycle_detected_with_path(self):
        # t0 依赖 t1，t1 依赖 t0
        tasks = [
            _task(0, deps=[{"prev_idx": 1, "type": "FS", "lag_days": 0}]),
            _task(1, deps=[{"prev_idx": 0, "type": "FS", "lag_days": 0}]),
        ]
        has_cycle, cycle = _detect_cycle_dfs(tasks)
        assert has_cycle is True
        assert cycle[0] == cycle[-1]  # 路径闭合
        assert set(cycle[:-1]) == {0, 1}

    def test_self_dependency_is_cycle(self):
        tasks = [_task(0, deps=[{"prev_idx": 0, "type": "FS", "lag_days": 0}])]
        has_cycle, _ = _detect_cycle_dfs(tasks)
        assert has_cycle is True

    def test_dag_no_cycle(self):
        tasks = [
            _task(0),
            _task(1, deps=[{"prev_idx": 0, "type": "FS", "lag_days": 0}]),
        ]
        has_cycle, cycle = _detect_cycle_dfs(tasks)
        assert has_cycle is False
        assert cycle == []

    def test_topological_sort_orders_before_after(self):
        tasks = [
            _task(0),
            _task(1, deps=[{"prev_idx": 0, "type": "FS", "lag_days": 0}]),
            _task(2, deps=[{"prev_idx": 1, "type": "FS", "lag_days": 0}]),
        ]
        order = topological_sort(tasks)
        assert order is not None
        assert order.index(0) < order.index(1) < order.index(2)

    def test_topological_sort_returns_none_on_cycle(self):
        tasks = [
            _task(0, deps=[{"prev_idx": 1, "type": "FS", "lag_days": 0}]),
            _task(1, deps=[{"prev_idx": 0, "type": "FS", "lag_days": 0}]),
        ]
        assert topological_sort(tasks) is None

    def test_validate_result_flags_cycle(self):
        tasks = [
            _task(0, deps=[{"prev_idx": 1, "type": "FS", "lag_days": 0}]),
            _task(1, deps=[{"prev_idx": 0, "type": "FS", "lag_days": 0}]),
        ]
        report = validate_result(_result(tasks), Settings())
        assert not report.passed
        assert L2_CYCLE in [i.code for i in report.issues]


# ═══════════════ 结构 / 孤立 / 数值 ═══════════════

class TestStructureOrphanRange:
    def test_parent_out_of_range(self):
        report = validate_result(_result([_task(0, parent_idx=5), _task(1)]), Settings())
        assert L2_STRUCTURE in [i.code for i in report.issues]

    def test_self_parent(self):
        report = validate_result(_result([_task(0, parent_idx=0), _task(1)]), Settings())
        assert any("自己" in i.message for i in report.issues)

    def test_parent_chain_cycle(self):
        # 0 的父是 1，1 的父是 0（父链环）
        report = validate_result(_result([_task(0, parent_idx=1), _task(1, parent_idx=0)]), Settings())
        assert any("父链成环" in i.message for i in report.issues)

    def test_orphan_flagged(self):
        # 两个互不相干的根任务：彼此无父子/依赖关系 → 双双孤立
        tasks = [_task(0), _task(1)]
        issues = _check_orphans(_result(tasks))
        assert [i.code for i in issues] == [L2_ORPHAN, L2_ORPHAN]
        assert [i.task_idx for i in issues] == [0, 1]

    def test_single_root_not_orphan(self):
        assert _check_orphans(_result([_task(0)])) == []

    def test_depended_root_not_orphan(self):
        tasks = [_task(0), _task(1, deps=[{"prev_idx": 0, "type": "FS", "lag_days": 0}])]
        assert _check_orphans(_result(tasks)) == []

    def test_task_limit(self):
        tasks = [_task(i) for i in range(11)]  # 默认上限 10
        report = validate_result(_result(tasks), Settings())
        assert L2_TASK_LIMIT in [i.code for i in report.issues]

    def test_depth_limit(self):
        # 6 层父链：任务 #5 深度 5 > 4（A4）
        tasks = [_task(0)] + [_task(i, parent_idx=i - 1) for i in range(1, 6)]
        assert _compute_depths(_result(tasks)) == [0, 1, 2, 3, 4, 5]
        report = validate_result(_result(tasks), Settings())
        assert L2_DEPTH_LIMIT in [i.code for i in report.issues]

    def test_valid_result_passes(self):
        result = DecomposeResult.model_validate(_valid_result_dict())
        report = validate_result(result, Settings())
        assert report.passed, report.issues

    def test_estimated_hours_out_of_range_flagged_by_l2(self):
        # model_construct 绕过 schema 构造 0 工时，L2 数值层兜底
        tasks = [_task(0), _task(1, estimated_hours=0, deps=[{"prev_idx": 0, "type": "FS", "lag_days": 0}])]
        report = validate_result(_result(tasks), Settings())
        assert any("estimated_hours" in i.message for i in report.issues)


# ═══════════════ 反馈格式化 ═══════════════

class TestFormatFeedback:
    def test_task_loc_and_global_loc(self):
        from app.services.validator import ValidationIssue

        text = format_feedback(
            [
                ValidationIssue("X", "越界", task_idx=3),
                ValidationIssue("Y", "整体问题"),
            ]
        )
        assert "[X] 任务#3：越界" in text
        assert "[Y] 整体：整体问题" in text
        assert "；" in text
