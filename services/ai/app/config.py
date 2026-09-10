"""AI 服务配置（pydantic-settings；.env 覆盖默认值）。

对应《开发方案》§3.7 环境变量清单（LLM 组 + 应用组 + AI 服务专有项）。
AI 服务无数据库/Redis/对象存储凭据 —— 永不直连业务库（§3.1 铁律）。
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """服务配置。env 变量名与字段名大小写不敏感（LITELLM_URL → litellm_url）。"""

    model_config = SettingsConfigDict(
        env_file=".env",  # 相对运行目录（services/ai）读取；真实凭据不进 git
        env_file_encoding="utf-8",
        extra="ignore",  # 未知环境变量不报错（部署侧可能注入其他服务变量）
        case_sensitive=False,
    )

    # —— 应用 ——
    app_env: str = "development"
    app_port: int = 8300
    log_level: str = "INFO"
    cors_origins: str = ""  # 逗号分隔；默认空 = 仅内部网络访问

    # —— 服务间鉴权（§3.5.2：内部网络 + 服务 token，与主服务共享）——
    ai_service_token: str = "dev-ai-service-token-change-me"

    # —— LLM（§3.7：凭据只放 LiteLLM，应用不直连供应商）——
    litellm_url: str = "http://localhost:4000/v1"
    litellm_api_key: str = ""
    llm_default_model: str = "deepseek-chat"  # C20：默认 DeepSeek/GLM 档，eval 后定稿
    llm_planning_model: str | None = None     # 拆解专用模型；空 = 跟随默认
    llm_temperature: float = Field(default=0.2, le=0.2)  # L1 铁律 ≤0.2；超限启动即失败
    llm_timeout_seconds: float = 60.0
    llm_max_retries: int = Field(default=3, ge=1, le=5)  # §3.5.4：L1 校验失败重试 ≤3 次
    llm_budget_per_call: float = Field(default=0.5, gt=0)  # 单次预算上限 $0.5（可配）
    llm_monthly_budget_alert: float = Field(default=50.0, ge=0)  # 月预算告警线（日志先行）

    # —— 主服务回调（AI 永不直连业务库，§3.1 / §3.5.2）——
    main_service_internal_url: str = "http://localhost:3000"
    callback_timeout_seconds: float = 10.0

    # —— 拆解限制（§3.5.2 单次 ≤8-10 步；A4 拆解深度 ≤4 层，计划为第 0 层）——
    decompose_max_tasks: int = Field(default=10, ge=1, le=50)
    decompose_max_depth: int = Field(default=4, ge=1, le=10)

    @property
    def cors_origin_list(self) -> list[str]:
        """CORS 白名单列表（空 = 不开放跨域，仅内部网络使用）。"""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """进程内单例配置（lru_cache 缓存）。"""
    return Settings()
