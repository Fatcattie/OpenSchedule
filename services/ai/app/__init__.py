"""OpenSchedule AI 服务（services/ai）。

FastAPI + LangGraph 骨架（模型为租户配置的 OpenAI 兼容端点）：拆解/评估/应急/执行（Phase 1 仅拆解草稿闭环）。
铁律：AI 提议、人确认；永不直连业务库（结果经回调 /internal/ai/results 交主服务审批门）。
"""
