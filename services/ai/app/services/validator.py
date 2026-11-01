"""L1/L2 确定性校验器（§3.5.4）——AI 服务与主服务双端实现并单测对齐。

- L1（格式层）：JSON 提取 + Pydantic v2 strict schema 校验（temperature ≤0.2 在 llm_client 侧保证）
- L2（语义层）：① 依赖闭环检测（DFS 三色判环 + Kahn 拓扑排序双实现）
  ② 孤立任务检查 ③ 数值范围/深度/任务数 ④ 与原始目标完整性核对（规则版；LLM 自检 TODO）

判环算法是真实实现（不是注释），与主服务落库前拓扑校验同源（§3.5.5：禁止闭环）。
"""
from __future__ import annotations

import json
import logging
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError

from ..config import Settings
from ..schemas.decompose import DecomposeResult

logger = logging.getLogger(__name__)

# 校验错误码
L1_JSON_INVALID = "L1_JSON_INVALID"        # 不是合法 JSON
L1_SCHEMA_INVALID = "L1_SCHEMA_INVALID"    # strict schema 校验失败
L2_CYCLE = "L2_CYCLE"                      # 依赖闭环
L2_STRUCTURE = "L2_STRUCTURE"              # 结构非法（越界/自依赖/父环）
L2_ORPHAN = "L2_ORPHAN"                    # 孤立任务
L2_RANGE = "L2_RANGE"                      # 数值越界
L2_DEPTH_LIMIT = "L2_DEPTH_LIMIT"          # 深度超限（A4：≤4 层）
L2_TASK_LIMIT = "L2_TASK_LIMIT"            # 任务数超限（§3.5.2：单次 ≤8-10 步）


@dataclass
class ValidationIssue:
    """单条校验问题（错误码 + 可读信息 + 定位）。"""

    code: str
    message: str
    task_idx: int | None = None
    extra: dict[str, Any] | None = None


@dataclass
class ValidationReport:
    """L2 校验结果。"""

    passed: bool
    issues: list[ValidationIssue] = field(default_factory=list)


def format_feedback(issues: list[ValidationIssue]) -> str:
    """把校验问题格式化为给 LLM 的修正反馈（L1/L2 打回重出，§3.5.4）。"""
    parts = []
    for issue in issues:
        loc = f"任务#{issue.task_idx}" if issue.task_idx is not None else "整体"
        parts.append(f"[{issue.code}] {loc}：{issue.message}")
    return "；".join(parts)


# ═══════════════════════ L1：格式层（§3.5.4 ①） ═══════════════════════

def extract_json(raw: str) -> str | None:
    """从 LLM 输出中提取 JSON 文本（容忍 ```json 围栏与首尾杂质）。"""
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        json.loads(raw)
        return raw
    except json.JSONDecodeError:
        pass
    # 去 markdown 围栏
    if raw.startswith("```"):
        lines = raw.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        candidate = "\n".join(lines).strip()
        if candidate:
            return candidate
    # 截取首个 { 到最后一个 }（LLM 常在 JSON 前后带解释文字）
    start, end = raw.find("{"), raw.rfind("}")
    if 0 <= start < end:
        return raw[start : end + 1]
    return None


def validate_l1_raw(raw: str) -> tuple[DecomposeResult | None, list[ValidationIssue]]:
    """L1：提取 JSON + Pydantic v2 strict 校验。返回 (结果 or None, 问题列表)。"""
    issues: list[ValidationIssue] = []
    text = extract_json(raw)
    if text is None:
        return None, [ValidationIssue(L1_JSON_INVALID, "LLM 输出不是合法 JSON（无法提取）")]
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        return None, [ValidationIssue(L1_JSON_INVALID, f"JSON 解析失败：{exc.msg}（位置 {exc.pos}）")]
    if not isinstance(data, dict):
        return None, [ValidationIssue(L1_JSON_INVALID, f"JSON 顶层必须是对象，实际为 {type(data).__name__}")]
    # version 是协议版本号：数值 1.0 归一化为字符串 "1.0"（其余字段保持 strict，不做任何宽松处理）
    if "version" in data and not isinstance(data["version"], str):
        data["version"] = str(data["version"])
    try:
        result = DecomposeResult.model_validate(data)
        return result, []
    except ValidationError as exc:
        for err in exc.errors():
            loc = ".".join(str(p) for p in err["loc"])
            issues.append(
                ValidationIssue(L1_SCHEMA_INVALID, f"{loc}: {err['msg']}", extra={"type": err.get("type")})
            )
        return None, issues


# ═══════════════════════ L2：语义层（§3.5.4 ②） ═══════════════════════

def validate_result(result: DecomposeResult, settings: Settings) -> ValidationReport:
    """L2 确定性校验：结构 → 判环 → 孤立 → 数值/深度/任务数 → 完整性。任一失败即打回。"""
    issues: list[ValidationIssue] = []
    issues += _check_structure(result)
    has_cycle, cycle = _detect_cycle_dfs(result.tasks)
    if has_cycle:
        path = " → ".join(f"#{i}" for i in cycle)
        issues.append(
            ValidationIssue(
                L2_CYCLE,
                f"依赖成环：{path}（闭环依赖必须在落库前拦截，与主服务拓扑校验同源）",
            )
        )
    if not has_cycle and topological_sort(result.tasks) is None:
        # Kahn 与 DFS 双保险：理论上 DFS 已覆盖，此处防实现分歧（两边结果应一致）
        issues.append(ValidationIssue(L2_CYCLE, "依赖图无法拓扑排序（存在闭环）"))
    issues += _check_orphans(result)
    issues += _check_ranges(result, settings)
    issues += _check_completeness(result)
    return ValidationReport(passed=not issues, issues=issues)


def _detect_cycle_dfs(tasks: list[Any]) -> tuple[bool, list[int]]:
    """DFS 三色标记判环（真实实现）：返回 (是否有环, 环路径)。

    颜色：0=未访问(WHITE)，1=在递归栈中(GRAY)，2=已回溯(BLACK)。
    遍历依赖边时遇到 GRAY 邻居即找到环：从递归栈中该邻居位置截取到栈顶 + 邻居本身 = 环路径。
    依赖边方向：任务 u 的 deps.prev_idx=v ⇒ 边 v→u（v 完成后 u 才能开始）。
    """
    n = len(tasks)
    WHITE, GRAY, BLACK = 0, 1, 2
    color = [WHITE] * n
    stack: list[int] = []
    cycle: list[int] = []

    def dfs(u: int) -> bool:
        color[u] = GRAY
        stack.append(u)
        for dep in tasks[u].deps:
            v = dep.prev_idx
            if not (0 <= v < n):
                continue  # 越界已由 _check_structure 报错，判环只关心合法边
            if color[v] == GRAY:
                # 找到环：v 在栈中，从 v 的位置截取到栈顶，再闭合回 v
                start = stack.index(v)
                cycle.extend(stack[start:])
                cycle.append(v)
                return True
            if color[v] == WHITE and dfs(v):
                return True
        stack.pop()
        color[u] = BLACK
        return False

    for i in range(n):
        if color[i] == WHITE and dfs(i):
            return True, cycle
    return False, []


def topological_sort(tasks: list[Any]) -> list[int] | None:
    """Kahn 拓扑排序（BFS 删入度，真实实现）：返回执行顺序；有环返回 None。

    与主服务落库前拓扑校验同源（§3.5.5：禁止闭环）；依赖边方向 v→u。
    """
    n = len(tasks)
    indegree = [0] * n
    adjacency: dict[int, list[int]] = {i: [] for i in range(n)}
    for u, task in enumerate(tasks):
        for dep in task.deps:
            v = dep.prev_idx
            if 0 <= v < n and v != u:
                adjacency[v].append(u)  # v 先完成，u 才能开始
                indegree[u] += 1
    queue = deque(i for i in range(n) if indegree[i] == 0)
    order: list[int] = []
    while queue:
        u = queue.popleft()
        order.append(u)
        for v in adjacency[u]:
            indegree[v] -= 1
            if indegree[v] == 0:
                queue.append(v)
    return order if len(order) == n else None


def _check_structure(result: DecomposeResult) -> list[ValidationIssue]:
    """结构合法性：parent_idx/deps 下标越界、自依赖、父链成环（把自己的后代设为父 = 环，§3.5.5）。"""
    issues: list[ValidationIssue] = []
    n = len(result.tasks)
    for i, task in enumerate(result.tasks):
        if task.parent_idx is not None and not (0 <= task.parent_idx < n):
            issues.append(ValidationIssue(L2_STRUCTURE, f"parent_idx={task.parent_idx} 越界（任务数 {n}）", i))
        if task.parent_idx == i:
            issues.append(ValidationIssue(L2_STRUCTURE, "不能把自己设为父任务", i))
        for dep in task.deps:
            if not (0 <= dep.prev_idx < n):
                issues.append(ValidationIssue(L2_STRUCTURE, f"deps.prev_idx={dep.prev_idx} 越界（任务数 {n}）", i))
            if dep.prev_idx == i:
                issues.append(ValidationIssue(L2_STRUCTURE, "禁止自依赖（任务不能依赖自己）", i))
    # 父链成环检测：沿 parent_idx 向上走，seen 集防重复；重复即环
    for i in range(n):
        seen: set[int] = set()
        cur = i
        while result.tasks[cur].parent_idx is not None:
            p = result.tasks[cur].parent_idx
            if not (0 <= p < n):
                break  # 越界已报
            if p in seen or p == cur:
                issues.append(
                    ValidationIssue(L2_STRUCTURE, f"父链成环：任务 #{i} 的祖先链出现重复节点 #{p}", i)
                )
                break
            seen.add(p)
            cur = p
    return issues


def _check_orphans(result: DecomposeResult) -> list[ValidationIssue]:
    """孤立任务检查：与整体计划无任何关联的任务（无父、无依赖、无子任务、无被依赖）。"""
    issues: list[ValidationIssue] = []
    n = len(result.tasks)
    children: dict[int, list[int]] = defaultdict(list)
    for i, task in enumerate(result.tasks):
        if task.parent_idx is not None:
            children[task.parent_idx].append(i)
    for i, task in enumerate(result.tasks):
        if task.parent_idx is not None:
            continue  # 有父任务即挂在拆解树上
        is_depended = any(t.deps and any(d.prev_idx == i for d in t.deps) for t in result.tasks)
        if n > 1 and not task.deps and not is_depended and not children.get(i):
            issues.append(
                ValidationIssue(L2_ORPHAN, f"任务 #{i}「{task.title[:30]}」与整体计划无任何关联（孤立任务）", i)
            )
    return issues


def _compute_depths(result: DecomposeResult) -> list[int]:
    """按父链计算每任务深度（计划/根任务为第 0 层）。父环已在结构检查拦截，此处仅防御性防死循环。"""
    memo: dict[int, int] = {}

    def depth_of(i: int, seen: set[int]) -> int:
        if i in memo:
            return memo[i]
        if i in seen:
            return 0  # 防御：父环场景避免无限递归（结构检查已报错）
        seen.add(i)
        parent = result.tasks[i].parent_idx
        # 越界 parent 已由 _check_structure 报错；此处防御性按根处理，避免 depth_of 越界崩溃
        if parent is None or not (0 <= parent < len(result.tasks)):
            depth = 0
        else:
            depth = depth_of(parent, seen) + 1
        memo[i] = depth
        return depth

    return [depth_of(i, set()) for i in range(len(result.tasks))]


def _check_ranges(result: DecomposeResult, settings: Settings) -> list[ValidationIssue]:
    """数值范围：估时 (0,1000]（§3.5.5）、lag_days [0,365]、深度 ≤4（A4）、任务数 ≤10（§3.5.2）。"""
    issues: list[ValidationIssue] = []
    if len(result.tasks) > settings.decompose_max_tasks:
        issues.append(
            ValidationIssue(
                L2_TASK_LIMIT,
                f"任务数 {len(result.tasks)} 超过单次上限 {settings.decompose_max_tasks}"
                "（长计划请分段拆解 + re-grounding）",
            )
        )
    for i, task in enumerate(result.tasks):
        if not (0 < task.estimated_hours <= 1000):
            issues.append(ValidationIssue(L2_RANGE, f"estimated_hours={task.estimated_hours} 超出 (0, 1000]", i))
        for dep in task.deps:
            if not (0 <= dep.lag_days <= 365):
                issues.append(ValidationIssue(L2_RANGE, f"lag_days={dep.lag_days} 超出 [0, 365]", i))
    for i, depth in enumerate(_compute_depths(result)):
        if depth > settings.decompose_max_depth:
            issues.append(
                ValidationIssue(
                    L2_DEPTH_LIMIT,
                    f"任务 #{i} 拆解深度 {depth} 超过上限 {settings.decompose_max_depth}（A4：≤4 层）",
                    i,
                )
            )
    return issues


def _check_completeness(result: DecomposeResult) -> list[ValidationIssue]:
    """与原始目标完整性核对（规则版双保险）。LLM 自检（prompt 内要求自评）待 C20 eval 落地后启用，TODO。"""
    issues: list[ValidationIssue] = []
    if not result.tasks:
        issues.append(ValidationIssue(L2_STRUCTURE, "tasks 为空：拆解结果没有任何任务"))
    if not result.summary:
        issues.append(ValidationIssue(L2_STRUCTURE, "summary 为空"))
    # TODO(Phase 1 C20)：规则部分可加"根任务数量/标题-描述关键词重合度"等启发式，
    # 阈值待 eval 数据积累后定；LLM 自检字段（self_check）需同步进 schema 后再启用。
    return issues
