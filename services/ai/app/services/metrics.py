"""AI 服务最小指标端点（R11）：让「回调死信」与「状态存储形态」可被 Prometheus 告警。

为什么手写而不是引入 `prometheus_client`：
  本服务只需要 4 个指标（up / 死信累计 / 死信积压 / 存储形态），
  引入客户端库会为一个文本端点增加运行时依赖与锁文件变更；
  exposition 格式本身极简且稳定（text/plain; version=0.0.4），手写更可控。

指标（前缀与主服务 `openschedule_*` 对齐，便于同一套告警/看板命名）：
  openschedule_ai_up 1
  openschedule_ai_dead_letters_recorded_total   进程内累计（counter，重启归零 → increase() 可正确处理）
  openschedule_ai_dead_letters                  当前积压条数（gauge，来自存储 count()）
  openschedule_ai_run_store_mode{mode="redis|memory"} 1
  openschedule_ai_dead_letter_store_mode{mode="redis|memory"} 1

告警口径：
  `increase(openschedule_ai_dead_letters_recorded_total[15m]) > 0` → 有新死信（critical）
  `openschedule_ai_run_store_mode{mode="memory"} == 1` → 生产环境持久化退化（warning）
"""
from __future__ import annotations

import logging

from .dead_letter import get_dead_letter_store
from .run_store import RedisRunStore, get_run_store

logger = logging.getLogger(__name__)

_dead_letters_recorded = 0


def inc_dead_letters_recorded() -> None:
    """记录一条新死信（供 counter 使用；由 `record_dead_letter` 调用）。"""
    global _dead_letters_recorded
    _dead_letters_recorded += 1


def reset_metrics() -> None:
    """复位进程内计数（仅测试使用）。"""
    global _dead_letters_recorded
    _dead_letters_recorded = 0


def _store_mode(store: object) -> str:
    return "redis" if isinstance(store, RedisRunStore) else "memory"


def _line(name: str, value: int | float, labels: dict[str, str] | None = None) -> str:
    if labels:
        rendered = ",".join(f'{key}="{val}"' for key, val in labels.items())
        return f"{name}{{{rendered}}} {value}"
    return f"{name} {value}"


async def render_metrics() -> str:
    """渲染 Prometheus text exposition（异步：死信积压需查存储）。"""
    lines = [
        "# HELP openschedule_ai_up AI 服务存活（抓取成功即 1）",
        "# TYPE openschedule_ai_up gauge",
        _line("openschedule_ai_up", 1),
        "# HELP openschedule_ai_dead_letters_recorded_total 进程启动以来写入的回调死信累计数",
        "# TYPE openschedule_ai_dead_letters_recorded_total counter",
        _line("openschedule_ai_dead_letters_recorded_total", _dead_letters_recorded),
    ]

    try:
        backlog = await get_dead_letter_store().count()
    except Exception:  # noqa: BLE001 - 指标端点不得因存储抖动整体 500
        logger.warning("ai_metrics_dead_letter_count_failed", exc_info=True)
    else:
        lines += [
            "# HELP openschedule_ai_dead_letters 当前可查询的回调死信条数",
            "# TYPE openschedule_ai_dead_letters gauge",
            _line("openschedule_ai_dead_letters", backlog),
        ]

    run_mode = _store_mode(get_run_store())
    dlq_mode = _store_mode(get_dead_letter_store())
    lines += [
        "# HELP openschedule_ai_run_store_mode run 状态存储形态（redis=可跨重启恢复）",
        "# TYPE openschedule_ai_run_store_mode gauge",
        _line("openschedule_ai_run_store_mode", 1, {"mode": run_mode}),
        "# HELP openschedule_ai_dead_letter_store_mode 死信存储形态（redis=可跨重启保留）",
        "# TYPE openschedule_ai_dead_letter_store_mode gauge",
        _line("openschedule_ai_dead_letter_store_mode", 1, {"mode": dlq_mode}),
    ]
    return "\n".join(lines) + "\n"
