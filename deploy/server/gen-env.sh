#!/usr/bin/env bash
# ============================================================
# 生成 / 补全 deploy/.env.production（R10-3）
#
# 在服务器上以部署用户执行（密钥在服务器本机生成，不经过任何其它机器）：
#   bash deploy/server/gen-env.sh --domain os.example.cn --email ops@example.cn --registry ghcr.io/<org>
#
# 行为：
#   - 文件不存在：从 deploy/.env.production.example 复制后填写
#   - 文件已存在：**只补空值，绝不重新生成已有密钥**（POSTGRES_PASSWORD 等在数据卷初始化后改了会导致连不上库，
#     ENCRYPTION_KEY 改了会让已加密的模型 key / 集成凭据无法解密）；可安全重复执行
#   - 自动生成：POSTGRES_PASSWORD / MINIO_ROOT_PASSWORD / JWT_* / ENCRYPTION_KEY / AI_SERVICE_TOKEN /
#     GRAFANA_ADMIN_PASSWORD / VAPID 密钥对
#     · 拼进 DATABASE_URL 的口令一律用 hex（base64 的 + / = 会破坏连接串）
#     · ENCRYPTION_KEY = 32 字节 base64（44 字符，AES-256-GCM）
#   - 文件权限 600；装了 docker 时顺带跑一次 `docker compose config` 校验
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATE="$ROOT/deploy/.env.production.example"
COMPOSE_FILE="$ROOT/deploy/docker-compose.prod.yml"
OUT="$ROOT/deploy/.env.production"

ARG_DOMAIN=""; ARG_EMAIL=""; ARG_REGISTRY=""; ARG_TAG=""
INTERACTIVE=1
[[ -t 0 ]] || INTERACTIVE=0

usage() {
  cat <<'EOF'
用法：bash deploy/server/gen-env.sh [选项]

  --domain DOMAIN      对外域名（Caddy 用它申请证书；DNS A 记录须已指向本机）
  --email EMAIL        ACME 证书账号邮箱
  --registry PREFIX    镜像仓库前缀，如 ghcr.io/<org>（小写，不带 https://）
  --tag TAG            初始镜像 tag（默认 v0.1.0；CI 发布时会用实际 tag 覆盖）
  --output PATH        输出文件（默认 deploy/.env.production；改了之后 compose 不会读它，仅用于预览）
  --yes                非交互：缺少的必填项直接报错，不提问
  -h, --help           显示本帮助
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) ARG_DOMAIN="${2:?--domain 需要参数}"; shift 2 ;;
    --email) ARG_EMAIL="${2:?--email 需要参数}"; shift 2 ;;
    --registry) ARG_REGISTRY="${2:?--registry 需要参数}"; shift 2 ;;
    --tag) ARG_TAG="${2:?--tag 需要参数}"; shift 2 ;;
    --output) OUT="${2:?--output 需要参数}"; shift 2 ;;
    --yes) INTERACTIVE=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -t 1 ]]; then
  C_INFO=$'\033[36m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_END=$'\033[0m'
else
  C_INFO=""; C_OK=""; C_WARN=""; C_ERR=""; C_END=""
fi
ok()   { printf '%s  ✓ %s%s\n' "$C_OK" "$*" "$C_END"; }
warn() { printf '%s  ! %s%s\n' "$C_WARN" "$*" "$C_END"; }
die()  { printf '%s  ✗ %s%s\n' "$C_ERR" "$*" "$C_END" >&2; exit 1; }

command -v openssl >/dev/null 2>&1 || die "需要 openssl（先跑 deploy/server/bootstrap.sh）"
[[ -r "$TEMPLATE" ]] || die "找不到模板：$TEMPLATE"

# ---------- env 文件读写（awk + ENVIRON，值里有 / + = 也不需要转义） ----------
get_val() {
  K="$1" awk 'BEGIN { k = ENVIRON["K"] "=" } index($0, k) == 1 { print substr($0, length(k) + 1); exit }' "$OUT"
}

set_val() {
  local tmp
  tmp="$(mktemp "${OUT}.XXXXXX")"
  K="$1" V="$2" awk '
    BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"]; done = 0 }
    index($0, k "=") == 1 { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$OUT" > "$tmp"
  cat "$tmp" > "$OUT"   # 写回原文件而非 mv：保留 600 权限与属主
  rm -f "$tmp"
}

is_placeholder() { [[ -z "$1" || "$1" == *example* || "$1" == *change-me* ]]; }

rand_hex() { openssl rand -hex "$1"; }
rand_b64() { openssl rand -base64 "$1" | tr -d '\n'; }
b64url()   { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

ask() {
  # ask 变量名 提示 默认值
  local __var="$1" prompt="$2" def="${3:-}" ans
  if [[ "$INTERACTIVE" == 1 ]]; then
    read -r -p "  $prompt${def:+ [$def]}: " ans
    printf -v "$__var" '%s' "${ans:-$def}"
  else
    printf -v "$__var" '%s' "$def"
  fi
}

# ---------- 1. 准备文件 ----------
umask 077
printf '%s==> %s%s\n' "$C_INFO" "$OUT" "$C_END"
if [[ -e "$OUT" ]]; then
  cp -p "$OUT" "$OUT.bak.$(date +%Y%m%d%H%M%S)"
  ok "已存在：只补空值，已有密钥保持不变（原文件已备份为 .bak.*）"
else
  cp "$TEMPLATE" "$OUT"
  ok "已从模板创建"
fi
chmod 600 "$OUT"

# 模板新增的变量（升级后）追加到已有文件末尾，避免漏配
while IFS= read -r line; do
  key="${line%%=*}"
  if [[ -z "$(K="$key" awk 'BEGIN { k = ENVIRON["K"] "=" } index($0, k) == 1 { print 1; exit }' "$OUT")" ]]; then
    printf '%s\n' "$line" >> "$OUT"
    warn "补入模板新增变量：$key"
  fi
done < <(grep -E '^[A-Z0-9_]+=' "$TEMPLATE")

# ---------- 2. 部署参数（域名 / 邮箱 / 镜像） ----------
DOMAIN_RE='^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$'
EMAIL_RE='^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
REGISTRY_RE='^[a-z0-9.-]+(:[0-9]+)?(/[a-z0-9._-]+)+$'
TAG_RE='^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$'

resolve_param() {
  # resolve_param KEY 参数值 提示 默认值 正则 错误说明
  local key="$1" arg="$2" prompt="$3" def="$4" re="$5" hint="$6" cur val
  cur="$(get_val "$key")"
  if [[ -n "$arg" ]]; then
    val="$arg"
  elif ! is_placeholder "$cur"; then
    val="$cur"
  else
    ask val "$prompt" "$def"
  fi
  [[ -n "$val" ]] || die "$key 未提供（$hint）；用参数传入或去掉 --yes 交互填写"
  [[ "$val" =~ $re ]] || die "$key 格式不对：$val（$hint）"
  set_val "$key" "$val"
  printf -v "$key" '%s' "$val"
}

resolve_param DOMAIN "$ARG_DOMAIN" "对外域名" "" "$DOMAIN_RE" "如 os.example.cn"
resolve_param ACME_EMAIL "$ARG_EMAIL" "证书邮箱" "" "$EMAIL_RE" "如 ops@example.cn"
ARG_REGISTRY="${ARG_REGISTRY%/}"; ARG_REGISTRY="${ARG_REGISTRY#https://}"
resolve_param REGISTRY "$ARG_REGISTRY" "镜像仓库前缀" "" "$REGISTRY_RE" "如 ghcr.io/my-org，全小写、不带 https://"
resolve_param IMAGE_TAG "$ARG_TAG" "初始镜像 tag" "v0.1.0" "$TAG_RE" "如 v0.1.0"
ok "DOMAIN=$DOMAIN  ACME_EMAIL=$ACME_EMAIL  REGISTRY=$REGISTRY  IMAGE_TAG=$IMAGE_TAG"

# 由域名/邮箱派生的项：仍是模板占位值时才改
is_placeholder "$(get_val CORS_ORIGINS)" && set_val CORS_ORIGINS "https://$DOMAIN"
is_placeholder "$(get_val VAPID_SUBJECT)" && set_val VAPID_SUBJECT "mailto:$ACME_EMAIL"
is_placeholder "$(get_val MAIL_FROM)" && set_val MAIL_FROM "OpenSchedule <no-reply@$DOMAIN>"
[[ "$(get_val CORS_ORIGINS)" == *"$DOMAIN"* ]] || warn "CORS_ORIGINS=$(get_val CORS_ORIGINS) 不含 $DOMAIN，确认是否有意为之"

# ---------- 3. 密钥（只填空值） ----------
GENERATED=()
gen_secret() {
  # gen_secret KEY 生成方式(hex|b64) 字节数
  local key="$1" kind="$2" bytes="$3" cur
  cur="$(get_val "$key")"
  if [[ -n "$cur" ]]; then
    [[ "$cur" != *change-me* ]] || die "$key 仍是 change-me 占位值：确认该环境从未用它初始化过数据后，手动清空该行再重跑"
    return
  fi
  if [[ "$kind" == hex ]]; then set_val "$key" "$(rand_hex "$bytes")"; else set_val "$key" "$(rand_b64 "$bytes")"; fi
  GENERATED+=("$key")
}

gen_secret POSTGRES_PASSWORD hex 24
gen_secret MINIO_ROOT_PASSWORD hex 24
gen_secret JWT_ACCESS_SECRET b64 48
gen_secret JWT_REFRESH_SECRET b64 48
gen_secret ENCRYPTION_KEY b64 32
gen_secret AI_SERVICE_TOKEN hex 32
gen_secret GRAFANA_ADMIN_PASSWORD hex 16

# POSTGRES_PASSWORD / USER / DB 直接拼进 DATABASE_URL，含 URL 保留字符会让 api/migrate 连不上库
for key in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB; do
  [[ "$(get_val "$key")" =~ ^[A-Za-z0-9._~-]+$ ]] || warn "$key 含 URL 保留字符，DATABASE_URL 会解析失败（建议只用字母数字）"
done
[[ "$(get_val ENCRYPTION_KEY)" =~ ^[A-Za-z0-9+/]{43}=$ ]] || warn "ENCRYPTION_KEY 不是 32 字节 base64（44 字符），AES-256-GCM 将无法使用"

# WebPush VAPID：两键都空时用 openssl 生成 P-256 密钥对（base64url，web-push 直接可用）
if [[ -z "$(get_val VAPID_PUBLIC_KEY)" && -z "$(get_val VAPID_PRIVATE_KEY)" ]]; then
  pem="$(openssl ecparam -name prime256v1 -genkey -noout 2>/dev/null)"
  # 私钥 = SEC1 DER 第 8 字节起的 32 字节；公钥 = SPKI DER 末尾 65 字节（0x04 + X + Y）
  vapid_priv="$(printf '%s\n' "$pem" | openssl ec -outform DER 2>/dev/null | dd bs=1 skip=7 count=32 status=none | b64url)"
  vapid_pub="$(printf '%s\n' "$pem" | openssl ec -pubout -outform DER 2>/dev/null | tail -c 65 | b64url)"
  if [[ ${#vapid_priv} -eq 43 && ${#vapid_pub} -eq 87 ]]; then
    set_val VAPID_PRIVATE_KEY "$vapid_priv"
    set_val VAPID_PUBLIC_KEY "$vapid_pub"
    GENERATED+=(VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY)
  else
    warn "VAPID 密钥生成失败（openssl 不支持 prime256v1？），浏览器推送将不可用，可稍后手动填写"
  fi
  unset pem vapid_priv vapid_pub
fi

if (( ${#GENERATED[@]} > 0 )); then
  ok "已生成：${GENERATED[*]}"
else
  ok "密钥均已存在，未改动"
fi

# ---------- 4. 可选项提示 ----------
printf '\n%s可选项（留空即降级，不影响启动）：%s\n' "$C_INFO" "$C_END"
optional_status() {
  local label="$1"; shift
  local key filled=()
  for key in "$@"; do [[ -n "$(get_val "$key")" ]] && filled+=("$key"); done
  if (( ${#filled[@]} > 0 )); then
    printf '  ✓ %-16s %s\n' "$label" "${filled[*]}"
  else
    printf '  - %-16s 未配置（%s）\n' "$label" "$*"
  fi
}
optional_status "Sentry 错误上报" SENTRY_DSN WEB_SENTRY_DSN AI_SENTRY_DSN
optional_status "告警群机器人" ALERT_FEISHU_WEBHOOK ALERT_DINGTALK_WEBHOOK ALERT_WECOM_WEBHOOK ALERT_WEBHOOK_URL
optional_status "邮件 SMTP" SMTP_HOST SMTP_USER
optional_status "浏览器推送" VAPID_PUBLIC_KEY
echo "  （上线放行条件 #6 要求 Sentry 与告警通道在 staging 实测过，见 docs/ops/go-no-go.md）"

# ---------- 5. 校验 ----------
printf '\n%s校验：%s\n' "$C_INFO" "$C_END"
resolved="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1 { print $1 }' || true)"
if [[ -n "$resolved" ]]; then
  ok "$DOMAIN 解析到 $resolved（确认这是本机公网 IP，否则证书签发会失败）"
else
  warn "$DOMAIN 尚未解析：先在 DNS 加 A 记录指向本机公网 IP，再启动 caddy"
fi

if [[ "$OUT" != "$ROOT/deploy/.env.production" ]]; then
  warn "输出不是 deploy/.env.production，compose 不会读取它，跳过 compose 校验"
elif ! command -v docker >/dev/null 2>&1; then
  warn "未安装 docker，跳过 compose 校验"
elif docker compose --env-file "$OUT" -f "$COMPOSE_FILE" \
    --profile tools --profile ops --profile observability config -q 2>/tmp/os-compose-check.$$; then
  ok "docker compose config 通过（全部 profile）"
  rm -f /tmp/os-compose-check.$$
else
  warn "docker compose config 未通过："
  sed 's/^/      /' /tmp/os-compose-check.$$ >&2
  rm -f /tmp/os-compose-check.$$
  exit 1
fi

cat <<EOF

完成：$OUT（权限 600，已被 .gitignore 排除，切勿复制到仓库或聊天记录）
建议把该文件另存一份到密码管理器：丢失 POSTGRES_PASSWORD / ENCRYPTION_KEY 意味着库和已加密凭据无法恢复。
下一步：node deploy/drill/run.mjs --env-file deploy/.env.production（见 docs/ops/staging-drill.md）
EOF
