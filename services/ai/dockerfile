# syntax=docker/dockerfile:1
# ============================================================
# OpenSchedule AI 服务镜像（Python 3.12 + FastAPI + LangGraph，多阶段构建）
# 方案 chapter_02 §2：AI 服务独立部署、永不直连业务库（只经主服务回调写数据）
# 依赖管理：uv（pyproject.toml + uv.lock，方案约定）；requirements.txt 兜底兼容
# 构建上下文 = 仓库根目录（配合根 .dockerignore）
# 构建方式（仓库根目录）：
#   docker compose --env-file .env -f deploy/docker-compose.yml build ai
# 依赖契约（由 AI 同事实现，缺一则构建/运行报错，属预期）：
#   - services/ai/pyproject.toml（uv 可解析）或 requirements.txt 二选一
#   - app/main.py 提供 FastAPI 实例与 GET /health 端点（B1 验收点）
# 端口约定：8300（与 services/ai/.env.example 的 APP_PORT=8300 及本地 README 一致）
# ============================================================

# ---------- 阶段 1：基础层 ----------
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

# ---------- 阶段 2：依赖安装 ----------
FROM base AS deps
# 仅复制 AI 服务目录（.dockerignore 已排除 .venv/__pycache__ 等本地产物）
COPY services/ai/ ./
# 优先级：requirements.txt > uv.lock（冻结）> uv sync（无锁自动生成，开发期可接受）
RUN pip install --no-cache-dir uv \
    && if [ -f requirements.txt ]; then \
         pip install --no-cache-dir -r requirements.txt; \
       elif [ -f uv.lock ]; then \
         uv sync --frozen --no-dev; \
       else \
         uv sync --no-dev; \
       fi

# ---------- 阶段 3：运行层（复用依赖层，含 uv 生成的 .venv） ----------
FROM python:3.12-slim AS runner
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY --from=deps /app ./
# uv 安装的依赖位于 .venv，加入 PATH（requirements.txt 路径下 .venv 不存在，无害）
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8300
# 健康检查依赖 GET /health（B1 验收点）
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8300/health',timeout=3).status==200 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8300"]
