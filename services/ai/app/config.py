"""AI 服务配置（pydantic-settings；.env 覆盖默认值）。

对应《开发方案》§3.7 环境变量清单（LLM 组 + 应用组 + AI 服务专有项）。

铁律不变：AI 服务**永不直连业务库**（§3.1）。R11 为 run 状态持久化与回调死信引入
**AI 自有** Redis（`ai_state_redis_url`，键前缀 `osai:`，与主服务逻辑隔离），
它只承载 run 帧与回调死信，不含任何业务数据。
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# 启动即拒绝的占位标记（与主服务 startup-guard.ts 的 PLACEHOLDER_MARKERS 保持一致）
PLACEHOLDER_MARKERS: tuple[str, ...] = ("change-me", "changeme")


class Settings(BaseSettings):
    """服务配置。env 变量名与字段名大小写不敏感（LOG_LEVEL → log_level）。"""

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

    # —— 错误上报（Sentry Envelope 直连；空 = no-op）——
    # AI_SENTRY_DSN 优先（AI 独立 Sentry 项目）；未设时沿用与主服务共用的 SENTRY_DSN
    sentry_dsn: str = Field(default="", validation_alias=AliasChoices("AI_SENTRY_DSN", "SENTRY_DSN"))
    sentry_release: str = ""

    # —— 服务间鉴权（§3.5.2：内部网络 + 服务 token，与主服务共享）——
    # 默认值仅供本地开发/测试；APP_ENV=production 时为空或含占位串即拒绝启动（_reject_placeholder_secrets）
    ai_service_token: str = "dev-ai-service-token-change-me"

    # —— LLM 调用参数 ——
    # 端点/凭据/模型不在服务配置里：由租户管理员在设置页配置，主服务随每次请求下发（DecomposeRequest.llm）
    llm_temperature: float = Field(default=0.2, le=0.2)  # L1 铁律 ≤0.2；超限启动即失败
    llm_timeout_seconds: float = 60.0
    llm_max_retries: int = Field(default=3, ge=1, le=5)  # §3.5.4：L1 校验失败重试 ≤3 次
    llm_budget_per_call: float = Field(default=0.5, gt=0)  # 单次预算上限 $0.5（可配）
    llm_monthly_budget_alert: float = Field(default=50.0, ge=0)  # 月预算告警线（日志先行）

    # —— 主服务回调（AI 永不直连业务库，§3.1 / §3.5.2）——
    main_service_internal_url: str = "http://localhost:3000"
    callback_timeout_seconds: float = 10.0
    ai_callback_max_attempts: int = Field(default=3, ge=1, le=10)  # 回调重试次数（耗尽 → 死信）

    # —— AI 自有状态存储（R11：run 持久化 + 回调死信；与业务数据无关）——
    ai_run_store: str = "auto"  # auto=探测 Redis，连不上降级 memory；redis=失败即抛；memory=单进程
    ai_state_redis_url: str = "redis://localhost:6379/3"  # 键前缀 osai:，与主服务逻辑隔离
    ai_state_ttl_seconds: int = Field(default=3600, ge=60)  # run/死信键存活时长
    ai_state_max_frames: int = Field(default=200, ge=10, le=2000)  # 重放帧上限（与 SSE 重放上限一致）
    ai_dlq_max_entries: int = Field(default=200, ge=10, le=5000)  # 死信条数上限

    # —— 拆解限制（§3.5.2 单次 ≤8-10 步；A4 拆解深度 ≤4 层，计划为第 0 层）——
    decompose_max_tasks: int = Field(default=10, ge=1, le=50)
    decompose_max_depth: int = Field(default=4, ge=1, le=10)

    @model_validator(mode="after")
    def _reject_placeholder_secrets(self) -> Settings:
        """生产 fail-fast：AI_SERVICE_TOKEN 不得为空或沿用公开的占位默认值（安全问题 H-1）。"""
        if self.app_env.strip().lower() == "production":
            token = self.ai_service_token.strip().lower()
            if not token or any(marker in token for marker in PLACEHOLDER_MARKERS):
                raise ValueError("生产环境 AI_SERVICE_TOKEN 未配置或仍为占位值（含 change-me），拒绝启动")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        """CORS 白名单列表（空 = 不开放跨域，仅内部网络使用）。"""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """进程内单例配置（lru_cache 缓存）。"""
    return Settings()
