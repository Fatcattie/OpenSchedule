"""OpenSchedule AI 服务入口（FastAPI）。

- 服务 token 鉴权依赖（require_service_token）：内部网络接口统一挂载，§3.5.2
- 路由：/ai/decompose（202 + run_id）→ /ai/decompose/{run_id}/stream（SSE，§3.5.3）
- /health：docker-compose 健康检查用（公开，不带鉴权）
"""
from __future__ import annotations

import hmac
import logging

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import decompose


def setup_logging() -> None:
    """按配置初始化根日志（LOG_LEVEL）。"""
    settings = get_settings()
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


async def require_service_token(authorization: str | None = Header(default=None)) -> None:
    """服务间鉴权：Authorization: Bearer <AI_SERVICE_TOKEN>（与主服务共享同一密钥，§3.5.2）。

    AI 服务不暴露公网（主服务经 SSE 代理 /stream/ai 收口鉴权/审计，§4.7 风险 2）；
    本依赖是内部网络的最后一道防线。
    """
    settings = get_settings()
    expected = settings.ai_service_token
    if not expected:
        raise HTTPException(
            status_code=500, detail={"code": "AI_CONFIG_ERROR", "message": "AI_SERVICE_TOKEN 未配置"}
        )
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail={"code": "40101", "message": "缺少服务 token"})
    got = authorization[len("Bearer "):].strip()
    if not hmac.compare_digest(got, expected):  # 恒定时间比较，防时序侧信道
        raise HTTPException(status_code=401, detail={"code": "40101", "message": "服务 token 无效"})


def create_app() -> FastAPI:
    """应用工厂。"""
    settings = get_settings()
    setup_logging()
    app = FastAPI(
        title="OpenSchedule AI Service",
        description="AI 能力服务：拆解/评估/应急/执行。铁律：AI 提议、人确认；永不直连业务库（经主服务 /internal/ai/results 回调）。",
        version="0.1.0",
    )
    if settings.cors_origin_list:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # 全部 /ai/* 接口挂服务 token 鉴权（内部网络；主服务经 ai-gateway-client 调用，§3.5.2）
    app.include_router(decompose.router, dependencies=[Depends(require_service_token)])

    @app.get("/health")
    async def health() -> dict:
        """健康检查（docker-compose healthcheck 用；公开）。"""
        return {"status": "ok", "service": "openschedule-ai", "env": settings.app_env}

    @app.get("/")
    async def root() -> dict:
        return {"service": "OpenSchedule AI Service", "docs": "/docs", "health": "/health"}

    return app


app = create_app()
