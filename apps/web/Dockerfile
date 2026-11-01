# syntax=docker/dockerfile:1
# ============================================================
# OpenSchedule 前端镜像（React 19 + Vite，Node 22，多阶段构建）
# 本地开发定位：容器内跑 Vite dev server（HMR 经 5173 端口映射，见 compose，target: dev）
# 生产定位：多阶段构建出静态产物，nginx 托管（target: prod；见 deploy/docker-compose.prod.yml）
# 构建上下文 = 仓库根目录（配合根 .dockerignore）
# 构建方式（仓库根目录）：
#   docker compose --env-file .env -f deploy/docker-compose.yml build web            # 开发镜像（dev 目标）
#   docker compose --env-file .env.production -f deploy/docker-compose.prod.yml build web   # 生产镜像（prod 目标）
# 依赖契约（由前端同事实现，缺一则构建报错，属预期）：
#   - apps/web/package.json 存在 dev 脚本（vite dev，读取 VITE_API_PROXY_TARGET 做代理）
#   - 页面根路由返回 200（健康检查探活用）
# ============================================================

# ---------- 阶段 1：基础层 ----------
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# ---------- 阶段 2：依赖安装 ----------
FROM base AS deps
COPY . .
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi

# ---------- 阶段 3：开发运行层（compose 默认目标） ----------
FROM base AS dev
COPY --from=deps /app /app
# 默认值兜底；compose 中会以 environment 覆盖（浏览器侧地址）
ENV VITE_API_BASE_URL=http://localhost:3000
EXPOSE 5173
# 健康检查：Vite dev server 根路径返回 200 即视为存活
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5173/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# "--" 之后的参数透传给 vite：--host 0.0.0.0 允许容器外访问
CMD ["pnpm", "--filter", "./apps/web", "run", "dev", "--", "--host", "0.0.0.0"]

# ---------- 阶段 4：生产构建层（R10：web 生产镜像） ----------
# 构建期变量：Vite 会把 import.meta.env.VITE_* 内联进产物，故必须显式锁死
#   - VITE_USE_MOCK=false：生产绝不打到 mock 层（假数据不得上线）
#   - 不设 VITE_API_BASE_URL：前端 axios baseURL 固定为同源 /api/v1（api/config.ts），
#     由反向代理（deploy/caddy/Caddyfile）把 /api/* 转发到 api:3000，避免跨域与硬编码域名。
FROM base AS build
COPY --from=deps /app /app
ENV VITE_USE_MOCK=false
RUN pnpm --filter "./apps/web" run build
# 产物目录：apps/web/dist（vite.config.ts 默认 outDir；不再用 dist-mvp-* 历史目录）

# ---------- 阶段 5：生产运行层（nginx 静态托管 + SPA 回退） ----------
# 用法：docker compose -f deploy/docker-compose.prod.yml build web  （target: prod）
FROM nginx:1.27-alpine AS prod
# 使用自定义配置（SPA 回退 / 缓存头 / 安全头 / GET /health）
COPY deploy/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
# 运行时配置注入（WEB_SENTRY_DSN/APP_ENV/SENTRY_RELEASE → runtime-config.js；同一镜像跨环境复用）
COPY --chmod=0755 deploy/web/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
EXPOSE 80
# 健康检查：静态站点与 /health 均可访问即视为就绪
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1
CMD ["nginx", "-g", "daemon off;"]
