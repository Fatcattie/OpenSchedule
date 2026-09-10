"""拆解接口的 Pydantic 严格 schema —— §3.5.2 ai_proposals.payload 正式定义。

字段命名遵循 §3.1：API/DTO 用 camelCase；Pydantic v2 strict 模式（默认不隐式转换类型，
LLM 输出"8h"之类脏值直接 L1 失败 → 反馈重试，§3.5.4）。
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# 依赖类型（§3.2 task_dependencies.type：FS/SS/FF/SF 四类）
DependencyType = Literal["FS", "SS", "FF", "SF"]

# 优先级（§3.5.5：urgent/high/medium/low，默认 medium）
Priority = Literal["urgent", "high", "medium", "low"]

# 拆解粒度（§3.5.2：粗/中/细）
# TODO：若主服务希望 ASCII 枚举（coarse/medium/fine），在此加别名即可，改一行
Granularity = Literal["粗", "中", "细"]

# 拆解视角（§3.5.2：时间/角色/模块）
Perspective = Literal["时间", "角色", "模块"]


class DecomposeConstraints(BaseModel):
    """拆解约束（均可选）。"""

    model_config = ConfigDict(strict=True)

    budget_hours: float | None = Field(default=None, gt=0, le=1000, strict=False)  # 总预算工时
    people: int | None = Field(default=None, gt=0, le=100)  # 可用人数
    industry: str | None = Field(default=None, min_length=1, max_length=100)  # 行业/场景


class DecomposeRequest(BaseModel):
    """POST /ai/decompose 请求体（§3.5.2）。"""

    model_config = ConfigDict(strict=True)

    tenant_id: str = Field(min_length=1, max_length=64)  # 租户 id（uuid 字符串；AI 服务视为不透明标识，不落库）
    project_id: str = Field(min_length=1, max_length=64)  # 项目 id（同上）
    description: str = Field(min_length=1, max_length=5000)  # 计划描述（拆解输入）
    constraints: DecomposeConstraints = Field(default_factory=DecomposeConstraints)
    granularity: Granularity = "中"
    perspective: Perspective = "角色"


class TaskDependency(BaseModel):
    """任务依赖（引用 tasks 数组下标，§3.5.2 deps）。"""

    model_config = ConfigDict(strict=True)

    prev_idx: int = Field(ge=0)  # 前置任务在 tasks 数组中的下标
    type: DependencyType = "FS"
    lag_days: int = Field(default=0, ge=0, le=365)  # 滞后天数（默认 0）
    is_shared: bool = False  # 共享子任务/公共前置（★D6，"重叠优先"依赖交汇的数据载体）


class DecomposeTask(BaseModel):
    """拆解出的单条任务。"""

    model_config = ConfigDict(strict=True)

    title: str = Field(min_length=1, max_length=200)  # §3.5.5：1–200 字符
    description: str = Field(default="", max_length=2000)
    estimated_hours: float = Field(gt=0, le=1000, strict=False)  # §3.5.5：(0,1000]，小数 1 位
    priority: Priority = "medium"
    assignee_hint: str | None = Field(default=None, max_length=100)  # 建议指派（只建议不指派）
    parent_idx: int | None = Field(default=None, ge=0)  # 父任务下标；null=根（拆解深度 ≤4，A4）
    deps: list[TaskDependency] = Field(default_factory=list)
    reason: str = Field(min_length=1, max_length=500)  # 为什么这么拆（可解释性，DoD）


class DecomposeResult(BaseModel):
    """拆解结果 —— = ai_proposals.payload 正式定义（§3.5.2）。"""

    model_config = ConfigDict(strict=True)

    version: str = "1.0"  # payload schema 版本
    summary: str = Field(min_length=1, max_length=1000)
    tasks: list[DecomposeTask] = Field(min_length=1)  # 单次 ≤8-10 步（L2 再校验）
    warnings: list[str] = Field(default_factory=list)
