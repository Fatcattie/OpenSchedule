#!/bin/sh
# ============================================================
# web 运行时配置注入（nginx 官方镜像在启动时执行 /docker-entrypoint.d/*.sh）
# 把环境变量写进 /usr/share/nginx/html/runtime-config.js，使同一不可变镜像可在
# staging / production 复用（构建期不烘焙 DSN/环境名）。
#   WEB_SENTRY_DSN   浏览器端 Sentry DSN（公开值；留空 = 错误上报 no-op）
#   APP_ENV          上报 environment（默认 production）
#   SENTRY_RELEASE   上报 release（可选，建议与 IMAGE_TAG 一致）
# ============================================================
set -eu

TARGET=/usr/share/nginx/html/runtime-config.js

# JSON 字符串转义：只处理反斜杠与双引号（取值为 URL/短标识，不含控制字符）
esc() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

cat > "$TARGET" <<EOF
window.__OS_RUNTIME__ = {"sentryDsn":"$(esc "${WEB_SENTRY_DSN:-}")","environment":"$(esc "${APP_ENV:-production}")","release":"$(esc "${SENTRY_RELEASE:-}")"}
EOF

echo "[runtime-config] 已生成 $TARGET（sentry=$([ -n "${WEB_SENTRY_DSN:-}" ] && echo on || echo off)）"
