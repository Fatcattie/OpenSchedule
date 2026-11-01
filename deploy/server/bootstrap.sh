#!/usr/bin/env bash
# ============================================================
# OpenSchedule 生产服务器初始化（R10-3；ADR D-02 = A 单机 compose / D-08 云主机 + Docker）
#
# 以 root 在一台新云主机上执行一次（可重复执行，已完成的步骤会跳过）：
#   sudo bash deploy/server/bootstrap.sh --ssh-pubkey "ssh-ed25519 AAAA... ci@github"
#   sudo bash deploy/server/bootstrap.sh --check        # 只检查不改动
#
# 支持的发行版（按 /etc/os-release 的 ID / ID_LIKE 判定家族）：
#   - Debian 系：Ubuntu 20.04+、Debian 11+（及其衍生版，取 UBUNTU_CODENAME / VERSION_CODENAME）
#   - RHEL 系：CentOS Stream / RHEL / Rocky / AlmaLinux / Oracle Linux 8+、
#             Alibaba Cloud Linux 3、Anolis OS 8、OpenCloudOS 8/9、TencentOS 3/4、Fedora
#   - 尽力支持：openEuler（按 EL8 使用 docker-ce 源，失败回落发行版自带 docker）
#
# 做什么：
#   1. 基础包（curl/git/openssl/ca-certificates）+ 时间同步（ACME 证书与 AI 回调 HMAC 300s 时间窗依赖准确时钟）
#   2. Docker Engine + compose 插件（要求 compose ≥ 2.24：prod 编排的 env_file.path/required 语法）
#      docker-ce 下载源 --mirror auto 时先探测官方源，不通则用阿里云镜像
#   3. /etc/docker/daemon.json：日志轮转 + live-restore + 可选 Docker Hub 镜像加速（--registry-mirror）
#   4. 部署用户（默认 deploy）：加入 docker 组、写入 CI 公钥（release.yml 以该用户 SSH 进来）
#   5. 防火墙：仅当 ufw / firewalld 已启用时放行 SSH + 80/tcp + 443/tcp + 443/udp（不擅自启用防火墙，避免锁死 SSH）
#   6. 内核参数（redis 需要 vm.overcommit_memory=1）+ 小内存机器自动建 swap
#   7. 可选 --repo：以部署用户 clone 仓库到 ~/openschedule（release.yml 约定路径）
#   8. 末尾输出环境检查报告（CPU/内存/磁盘/compose 版本/端口占用）
# ============================================================
set -euo pipefail

DEPLOY_USER="deploy"
SSH_PUBKEY=""
SSH_PUBKEY_FILE=""
MIRROR="auto"
REGISTRY_MIRRORS=()
REPO_URL=""
REPO_BRANCH="main"
SWAP_SIZE="2G"
SKIP_SWAP=0
SKIP_FIREWALL=0
CHECK_ONLY=0

# compose 最低版本：deploy/docker-compose.prod.yml 使用 env_file 的 path/required 长语法（compose 2.24 引入）
MIN_COMPOSE="2.24.0"
# 发行版仓库没有 compose 插件时的独立二进制下载地址（国内可用 COMPOSE_DOWNLOAD_BASE 指向镜像站）
COMPOSE_VERSION="v2.29.7"
COMPOSE_DOWNLOAD_BASE="${COMPOSE_DOWNLOAD_BASE:-https://github.com/docker/compose/releases/download}"

usage() {
  cat <<'EOF'
用法：sudo bash deploy/server/bootstrap.sh [选项]

  --user NAME              部署用户名（默认 deploy；对应 GitHub secrets 的 DEPLOY_USER）
  --ssh-pubkey "KEY"       写入部署用户 authorized_keys 的公钥（CI 的 DEPLOY_SSH_KEY 对应公钥）
  --ssh-pubkey-file PATH   同上，从文件读取
  --mirror MODE            docker-ce 下载源：auto（默认，官方不通则用阿里云）| official | aliyun | tencent | ustc
  --registry-mirror URL    Docker Hub 镜像加速地址（可重复；国内服务器拉 postgres/redis/caddy 等基础镜像时需要）
  --repo URL               以部署用户 clone 仓库到 ~/openschedule（私有仓库需先给部署用户配好 deploy key）
  --branch NAME            clone 的分支（默认 main）
  --swap-size SIZE         内存 < 4G 且无 swap 时创建的 swap 大小（默认 2G）
  --no-swap                不创建 swap
  --skip-firewall          不改防火墙规则
  --check                  只输出环境检查报告，不做任何改动
  -h, --help               显示本帮助
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user) DEPLOY_USER="${2:?--user 需要参数}"; shift 2 ;;
    --ssh-pubkey) SSH_PUBKEY="${2:?--ssh-pubkey 需要参数}"; shift 2 ;;
    --ssh-pubkey-file) SSH_PUBKEY_FILE="${2:?--ssh-pubkey-file 需要参数}"; shift 2 ;;
    --mirror) MIRROR="${2:?--mirror 需要参数}"; shift 2 ;;
    --registry-mirror) REGISTRY_MIRRORS+=("${2:?--registry-mirror 需要参数}"); shift 2 ;;
    --repo) REPO_URL="${2:?--repo 需要参数}"; shift 2 ;;
    --branch) REPO_BRANCH="${2:?--branch 需要参数}"; shift 2 ;;
    --swap-size) SWAP_SIZE="${2:?--swap-size 需要参数}"; shift 2 ;;
    --no-swap) SKIP_SWAP=1; shift ;;
    --skip-firewall) SKIP_FIREWALL=1; shift ;;
    --check) CHECK_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
  esac
done

# ---------- 输出 ----------
if [[ -t 1 ]]; then
  C_INFO=$'\033[36m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_END=$'\033[0m'
else
  C_INFO=""; C_OK=""; C_WARN=""; C_ERR=""; C_END=""
fi
WARNINGS=()
step() { printf '\n%s==> %s%s\n' "$C_INFO" "$*" "$C_END"; }
ok()   { printf '%s  ✓ %s%s\n' "$C_OK" "$*" "$C_END"; }
warn() { printf '%s  ! %s%s\n' "$C_WARN" "$*" "$C_END"; WARNINGS+=("$*"); }
die()  { printf '%s  ✗ %s%s\n' "$C_ERR" "$*" "$C_END" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

# 版本比较：ver_ge 2.29.7 2.24.0 → 真
ver_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" == "$2" ]]; }

# ---------- 发行版识别 ----------
OS_ID=""; OS_LIKE=""; OS_VERSION=""; OS_NAME=""; FAMILY=""; PKG=""
detect_os() {
  [[ -r /etc/os-release ]] || die "找不到 /etc/os-release，无法识别发行版"
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID="${ID:-}"; OS_LIKE="${ID_LIKE:-}"; OS_VERSION="${VERSION_ID:-}"; OS_NAME="${PRETTY_NAME:-$OS_ID}"
  case " $OS_ID $OS_LIKE " in
    *" debian "*|*" ubuntu "*) FAMILY="debian"; PKG="apt-get" ;;
    *" rhel "*|*" centos "*|*" fedora "*|*" openEuler "*|*" openeuler "*|*" anolis "*|*" opencloudos "*|*" tencentos "*|*" alinux "*)
      FAMILY="rhel"
      if have dnf; then PKG="dnf"; else PKG="yum"; fi
      ;;
    *) FAMILY="unknown" ;;
  esac
}

# docker-ce RHEL 源只认 EL 主版本号（7/8/9）；衍生版 VERSION_ID 不是 EL 版本，需要换算
el_major() {
  local major="${OS_VERSION%%.*}"
  case "$OS_ID" in
    alinux) [[ "$major" == "2" ]] && echo 7 || echo 8 ;;   # Alibaba Cloud Linux 2 ≈ EL7，3 ≈ EL8
    tencentos)
      if [[ "$major" == "2" ]]; then echo 7; elif [[ "$major" -ge 4 ]]; then echo 9; else echo 8; fi ;;
    openEuler|openeuler) echo 8 ;;
    *) echo "$major" ;;
  esac
}

# ---------- docker-ce 下载源 ----------
DOCKER_CE_BASE=""
pick_mirror() {
  local mode="$MIRROR"
  if [[ "$mode" == "auto" ]]; then
    if curl -fsS --connect-timeout 5 --max-time 10 -o /dev/null https://download.docker.com/linux/; then
      mode="official"
    else
      mode="aliyun"
      warn "官方 download.docker.com 不可达，改用阿里云 docker-ce 镜像源"
    fi
  fi
  case "$mode" in
    official) DOCKER_CE_BASE="https://download.docker.com/linux" ;;
    aliyun)   DOCKER_CE_BASE="https://mirrors.aliyun.com/docker-ce/linux" ;;
    tencent)  DOCKER_CE_BASE="https://mirrors.cloud.tencent.com/docker-ce/linux" ;;
    ustc)     DOCKER_CE_BASE="https://mirrors.ustc.edu.cn/docker-ce/linux" ;;
    *) die "--mirror 只支持 auto|official|aliyun|tencent|ustc，收到：$MIRROR" ;;
  esac
  ok "docker-ce 下载源：$DOCKER_CE_BASE"
}

compose_version() {
  docker compose version --short 2>/dev/null | sed 's/^v//' || true
}

# ============================================================
# 1. 基础包 + 时间同步
# ============================================================
install_base() {
  step "1/8 基础包与时间同步"
  if [[ "$FAMILY" == "debian" ]]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y -qq
    apt-get install -y -qq ca-certificates curl gnupg git openssl tar >/dev/null
  else
    # 只装缺的：EL9/Fedora 预装 curl-minimal，显式装 curl 会包冲突
    local missing=() bin
    for bin in curl git openssl tar; do have "$bin" || missing+=("$bin"); done
    if (( ${#missing[@]} > 0 )); then
      "$PKG" install -y -q "${missing[@]}" >/dev/null
    fi
    "$PKG" install -y -q ca-certificates >/dev/null 2>&1 || true
    # dnf config-manager 在 dnf-plugins-core 里；yum-config-manager 在 yum-utils 里（装不上不致命，后面直接写 repo 文件）
    "$PKG" install -y -q dnf-plugins-core >/dev/null 2>&1 || "$PKG" install -y -q yum-utils >/dev/null 2>&1 || true
  fi
  ok "curl / git / openssl 就绪"

  if have timedatectl && timedatectl set-ntp true >/dev/null 2>&1; then
    ok "已开启 NTP 时间同步（timedatectl）"
  elif have chronyd || "$PKG" install -y -q chrony >/dev/null 2>&1; then
    systemctl enable --now chronyd >/dev/null 2>&1 || systemctl enable --now chrony >/dev/null 2>&1 || true
    ok "已启用 chrony 时间同步"
  else
    warn "未能开启时间同步：请确认服务器时钟准确（证书签发与 AI 回调签名依赖它）"
  fi
}

# ============================================================
# 2. Docker Engine + compose 插件
# ============================================================
install_docker_debian() {
  local distro codename
  # Ubuntu 及其衍生版（Mint/Pop 等）用 ubuntu 源；其余 Debian 系用 debian 源
  if [[ "$OS_ID" == "ubuntu" || " $OS_LIKE " == *" ubuntu "* ]]; then
    distro="ubuntu"; codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
  else
    distro="debian"; codename="${VERSION_CODENAME:-}"
  fi
  [[ -n "$codename" ]] || return 1

  # 官方文档要求先移除发行版自带的冲突包
  for p in docker.io docker-doc docker-compose podman-docker containerd runc; do
    dpkg -s "$p" >/dev/null 2>&1 && apt-get remove -y -qq "$p" >/dev/null || true
  done

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "$DOCKER_CE_BASE/$distro/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] $DOCKER_CE_BASE/$distro $codename stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y -qq || return 1
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
}

install_docker_rhel() {
  local repo_distro="centos" major
  [[ "$OS_ID" == "fedora" ]] && repo_distro="fedora"
  major="$(el_major)"

  # RHEL 8/9 自带 podman/buildah 与 docker-ce 的 runc/containerd 冲突
  for p in podman buildah runc podman-docker docker docker-client docker-common docker-engine; do
    rpm -q "$p" >/dev/null 2>&1 && "$PKG" remove -y -q "$p" >/dev/null || true
  done

  # 直接写 repo 文件：衍生版的 $releasever 不是 EL 版本号，需替换为换算后的主版本
  curl -fsSL "$DOCKER_CE_BASE/$repo_distro/docker-ce.repo" -o /etc/yum.repos.d/docker-ce.repo
  sed -i "s#https://download.docker.com/linux#$DOCKER_CE_BASE#g" /etc/yum.repos.d/docker-ce.repo
  if [[ "$repo_distro" == "centos" ]]; then
    sed -i "s#\$releasever#$major#g" /etc/yum.repos.d/docker-ce.repo
  fi
  "$PKG" makecache -q >/dev/null 2>&1 || true
  "$PKG" install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
}

# docker-ce 源不可用时的回落：发行版自带 docker + 独立 compose 二进制
install_docker_fallback() {
  warn "docker-ce 源安装失败，回落到发行版自带的 docker 包"
  # 撤掉装不上的 docker-ce 源，否则它会让后续包管理器操作一直报错
  rm -f /etc/apt/sources.list.d/docker.list /etc/yum.repos.d/docker-ce.repo
  if [[ "$FAMILY" == "debian" ]]; then
    apt-get update -y -qq
    apt-get install -y -qq docker.io >/dev/null
    apt-get install -y -qq docker-compose-v2 >/dev/null 2>&1 || apt-get install -y -qq docker-compose-plugin >/dev/null 2>&1 || true
  else
    "$PKG" install -y -q moby-engine >/dev/null 2>&1 || "$PKG" install -y -q docker >/dev/null
  fi
}

install_compose_binary() {
  local arch target url
  case "$(uname -m)" in
    x86_64|amd64) arch="x86_64" ;;
    aarch64|arm64) arch="aarch64" ;;
    *) die "不支持的 CPU 架构：$(uname -m)" ;;
  esac
  target="/usr/local/lib/docker/cli-plugins/docker-compose"
  url="$COMPOSE_DOWNLOAD_BASE/$COMPOSE_VERSION/docker-compose-linux-$arch"
  mkdir -p "$(dirname "$target")"
  curl -fSL --connect-timeout 10 "$url" -o "$target" \
    || die "下载 compose 失败：$url（国内服务器可设置 COMPOSE_DOWNLOAD_BASE 指向镜像站后重试）"
  chmod +x "$target"
  ok "已安装 compose $COMPOSE_VERSION 独立插件"
}

install_docker() {
  step "2/8 Docker Engine 与 compose 插件"
  local cv
  if have docker; then
    ok "已安装 docker：$(docker --version)"
  else
    pick_mirror
    if [[ "$FAMILY" == "debian" ]]; then
      install_docker_debian || install_docker_fallback
    else
      install_docker_rhel || install_docker_fallback
    fi
    have docker || die "docker 安装失败"
    ok "安装完成：$(docker --version)"
  fi
  systemctl enable --now docker >/dev/null 2>&1 || die "docker 服务无法启动（journalctl -u docker 查看原因）"

  cv="$(compose_version)"
  if [[ -z "$cv" ]] || ! ver_ge "$cv" "$MIN_COMPOSE"; then
    warn "compose 版本 ${cv:-未安装} 低于要求的 $MIN_COMPOSE，尝试升级"
    if [[ "$FAMILY" == "debian" ]]; then
      apt-get install -y -qq --only-upgrade docker-compose-plugin >/dev/null 2>&1 || true
    else
      "$PKG" upgrade -y -q docker-compose-plugin >/dev/null 2>&1 || true
    fi
    cv="$(compose_version)"
    if [[ -z "$cv" ]] || ! ver_ge "$cv" "$MIN_COMPOSE"; then
      install_compose_binary
      cv="$(compose_version)"
    fi
  fi
  ver_ge "${cv:-0}" "$MIN_COMPOSE" || die "compose 版本仍不满足（当前 ${cv:-无}，需要 ≥ $MIN_COMPOSE）"
  ok "docker compose $cv"
}

# ============================================================
# 3. daemon.json
# ============================================================
configure_daemon() {
  step "3/8 Docker daemon 配置"
  local f=/etc/docker/daemon.json mirrors_json="" m
  for m in "${REGISTRY_MIRRORS[@]+"${REGISTRY_MIRRORS[@]}"}"; do
    mirrors_json+="${mirrors_json:+, }\"$m\""
  done
  mkdir -p /etc/docker

  if [[ ! -s "$f" ]]; then
    {
      echo '{'
      echo '  "log-driver": "json-file",'
      echo '  "log-opts": { "max-size": "20m", "max-file": "5" },'
      if [[ -n "$mirrors_json" ]]; then
        echo '  "registry-mirrors": ['"$mirrors_json"'],'
      fi
      echo '  "live-restore": true'
      echo '}'
    } > "$f"
    ok "已写入 $f（日志轮转 20m×5、live-restore${mirrors_json:+、镜像加速}）"
  elif have python3; then
    # 已有配置：备份后只补缺失的键，不覆盖用户已有设置
    cp "$f" "$f.bak.$(date +%Y%m%d%H%M%S)"
    python3 - "$f" "${REGISTRY_MIRRORS[@]+"${REGISTRY_MIRRORS[@]}"}" <<'PY'
import json, sys
path, mirrors = sys.argv[1], sys.argv[2:]
with open(path) as fh:
    cfg = json.load(fh)
cfg.setdefault("log-driver", "json-file")
cfg.setdefault("log-opts", {"max-size": "20m", "max-file": "5"})
cfg.setdefault("live-restore", True)
if mirrors:
    existing = cfg.setdefault("registry-mirrors", [])
    existing.extend(m for m in mirrors if m not in existing)
with open(path, "w") as fh:
    json.dump(cfg, fh, indent=2)
    fh.write("\n")
PY
    ok "已合并 $f（原文件已备份为 .bak.*）"
  else
    warn "$f 已存在且无 python3 可合并：请手动确认日志轮转${mirrors_json:+与 registry-mirrors}配置"
    return
  fi
  systemctl restart docker || die "docker 重启失败：daemon.json 可能有误（journalctl -u docker）"
}

# ============================================================
# 4. 部署用户
# ============================================================
setup_user() {
  step "4/8 部署用户 $DEPLOY_USER"
  if id -u "$DEPLOY_USER" >/dev/null 2>&1; then
    ok "用户已存在"
  else
    useradd -m -s /bin/bash "$DEPLOY_USER"
    ok "已创建用户（未设密码，仅允许密钥登录）"
  fi
  usermod -aG docker "$DEPLOY_USER"
  ok "已加入 docker 组（注意：docker 组等同 root 权限，只给部署账号）"

  local home key key_re='^(ssh-(ed25519|rsa)|ecdsa-sha2-nistp(256|384|521)) '
  home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
  if [[ -n "$SSH_PUBKEY_FILE" ]]; then
    [[ -r "$SSH_PUBKEY_FILE" ]] || die "读不到公钥文件：$SSH_PUBKEY_FILE"
    SSH_PUBKEY="$(cat "$SSH_PUBKEY_FILE")"
  fi
  install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$home/.ssh"
  touch "$home/.ssh/authorized_keys"
  if [[ -n "$SSH_PUBKEY" ]]; then
    key="$(printf '%s' "$SSH_PUBKEY" | tr -d '\r')"
    [[ "$key" =~ $key_re ]] || die "公钥格式不对（应以 ssh-ed25519 / ssh-rsa / ecdsa-sha2-* 开头）"
    if grep -qxF "$key" "$home/.ssh/authorized_keys"; then
      ok "公钥已存在于 authorized_keys"
    else
      printf '%s\n' "$key" >> "$home/.ssh/authorized_keys"
      ok "已写入公钥"
    fi
  elif [[ ! -s "$home/.ssh/authorized_keys" ]]; then
    warn "未提供 --ssh-pubkey：CI（release.yml）将无法 SSH 登录 $DEPLOY_USER，稍后补上后重跑本脚本即可"
  fi
  chown "$DEPLOY_USER:$DEPLOY_USER" "$home/.ssh/authorized_keys"
  chmod 600 "$home/.ssh/authorized_keys"
}

# ============================================================
# 5. 防火墙（只在已启用时追加放行规则）
# ============================================================
ssh_port() {
  local p
  p="$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}')" || true
  echo "${p:-22}"
}

configure_firewall() {
  step "5/8 防火墙"
  if [[ "$SKIP_FIREWALL" == 1 ]]; then ok "按 --skip-firewall 跳过"; return; fi
  local sp; sp="$(ssh_port)"
  if have ufw && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow "$sp/tcp" >/dev/null
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
    ufw allow 443/udp >/dev/null
    ok "ufw 已放行 $sp/tcp(SSH)、80/tcp、443/tcp、443/udp"
  elif have firewall-cmd && systemctl is-active --quiet firewalld; then
    firewall-cmd --permanent --add-port="$sp/tcp" >/dev/null
    firewall-cmd --permanent --add-service=http >/dev/null
    firewall-cmd --permanent --add-service=https >/dev/null
    firewall-cmd --permanent --add-port=443/udp >/dev/null
    firewall-cmd --reload >/dev/null
    ok "firewalld 已放行 $sp/tcp(SSH)、http、https、443/udp"
  else
    ok "系统防火墙未启用，未做改动"
  fi
  warn "云厂商安全组需放行入站 80/tcp、443/tcp、443/udp 与 SSH（$sp）；5432/6379/9000 等不要放行"
}

# ============================================================
# 6. 内核参数 + swap
# ============================================================
tune_system() {
  step "6/8 内核参数与 swap"
  cat > /etc/sysctl.d/99-openschedule.conf <<'EOF'
# OpenSchedule（deploy/server/bootstrap.sh 生成）
# redis 后台持久化 fork 需要；否则内存紧张时 BGSAVE/AOF 重写会失败
vm.overcommit_memory = 1
vm.swappiness = 10
net.core.somaxconn = 1024
EOF
  sysctl --system >/dev/null 2>&1 || warn "sysctl 加载失败（容器化/受限内核时常见），可忽略"
  ok "已写入 /etc/sysctl.d/99-openschedule.conf"

  if [[ "$SKIP_SWAP" == 1 ]]; then ok "按 --no-swap 跳过"; return; fi
  local mem_mb; mem_mb="$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)"
  if [[ -n "$(swapon --show --noheadings 2>/dev/null)" ]]; then
    ok "已有 swap，跳过"
  elif (( mem_mb >= 4000 )); then
    ok "内存 ${mem_mb}MB ≥ 4G，不创建 swap"
  elif [[ -e /swapfile ]]; then
    warn "/swapfile 已存在但未启用，未做改动"
  else
    fallocate -l "$SWAP_SIZE" /swapfile 2>/dev/null \
      || dd if=/dev/zero of=/swapfile bs=1M count="$(numfmt --from=iec "$SWAP_SIZE" | awk '{print int($1/1048576)}')" status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "内存 ${mem_mb}MB < 4G，已创建 $SWAP_SIZE swap"
  fi
}

# ============================================================
# 7. 仓库
# ============================================================
clone_repo() {
  step "7/8 部署目录"
  local home dir
  home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
  dir="$home/openschedule"
  if [[ -d "$dir/.git" ]]; then
    ok "$dir 已存在（release.yml 每次发布会自行 git fetch + checkout tag）"
  elif [[ -n "$REPO_URL" ]]; then
    sudo -u "$DEPLOY_USER" -H git clone --branch "$REPO_BRANCH" "$REPO_URL" "$dir" \
      || die "clone 失败：私有仓库需先给 $DEPLOY_USER 配置 deploy key（~/.ssh/id_ed25519 + GitHub Deploy keys）"
    ok "已 clone 到 $dir"
  else
    warn "未指定 --repo：请以 $DEPLOY_USER 身份 git clone 仓库到 $dir（release.yml 约定路径）"
  fi
}

# ============================================================
# 8. 检查报告（--check 也走这里）
# ============================================================
report() {
  step "8/8 环境检查报告"
  local cpus mem_mb disk_gb cv sp port
  cpus="$(nproc 2>/dev/null || echo '?')"
  mem_mb="$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)"
  disk_gb="$(df -BG --output=avail "$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib)" 2>/dev/null | tail -n1 | tr -dc '0-9')"
  printf '  系统      %s（家族：%s，架构：%s）\n' "$OS_NAME" "$FAMILY" "$(uname -m)"
  printf '  CPU/内存  %s 核 / %s MB\n' "$cpus" "$mem_mb"
  printf '  可用磁盘  %s GB（Docker 数据目录）\n' "${disk_gb:-?}"
  (( mem_mb >= 3500 )) || warn "内存不足 4G：全栈（含 observability）可能吃紧，建议 ≥ 4G"
  [[ "$cpus" == "?" ]] || (( cpus >= 2 )) || warn "CPU 少于 2 核"
  [[ -z "$disk_gb" ]] || (( disk_gb >= 20 )) || warn "可用磁盘少于 20G（镜像 + 数据库 + 14 天备份）"

  if have docker; then
    printf '  docker    %s\n' "$(docker --version)"
    cv="$(compose_version)"
    if [[ -n "$cv" ]] && ver_ge "$cv" "$MIN_COMPOSE"; then
      printf '  compose   %s ✓\n' "$cv"
    else
      warn "compose ${cv:-未安装}（需要 ≥ $MIN_COMPOSE）"
    fi
    systemctl is-active --quiet docker || warn "docker 服务未运行"
  else
    warn "未安装 docker"
  fi

  for port in 80 443; do
    if have ss && ss -ltnH "sport = :$port" 2>/dev/null | grep -q .; then
      if ! docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -q "caddy.*:$port->"; then
        warn "端口 $port 已被其它进程占用（caddy 需要独占 80/443）：$(ss -ltnpH "sport = :$port" | awk '{print $NF}' | head -n1)"
      fi
    fi
  done

  if id -u "$DEPLOY_USER" >/dev/null 2>&1; then
    if id -nG "$DEPLOY_USER" | grep -qw docker; then
      printf '  部署用户  %s（docker 组 ✓）\n' "$DEPLOY_USER"
    else
      warn "部署用户 $DEPLOY_USER 不在 docker 组"
    fi
  else
    warn "部署用户 $DEPLOY_USER 不存在"
  fi

  if have timedatectl; then
    if timedatectl show -p NTPSynchronized --value 2>/dev/null | grep -q yes; then
      printf '  时钟      已同步 ✓\n'
    else
      warn "时钟尚未与 NTP 同步（刚开启时需等几分钟）"
    fi
  fi
  sp="$(ssh_port)"; printf '  SSH 端口  %s\n' "$sp"
}

next_steps() {
  local home; home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6 2>/dev/null || echo "~$DEPLOY_USER")"
  cat <<EOF

下一步（以 $DEPLOY_USER 身份）：
  sudo -iu $DEPLOY_USER
  cd $home/openschedule
  bash deploy/server/gen-env.sh --domain <域名> --email <证书邮箱> --registry ghcr.io/<org>
  # 首次发布与演练：docs/ops/staging-drill.md（node deploy/drill/run.mjs）
EOF
}

main() {
  detect_os
  if [[ "$CHECK_ONLY" == 1 ]]; then
    report
  else
    [[ "$(id -u)" == 0 ]] || die "请用 root 执行（sudo bash $0 ...）"
    [[ "$FAMILY" != "unknown" ]] || die "暂不支持的发行版：$OS_NAME（ID=$OS_ID ID_LIKE=$OS_LIKE）。可手动安装 Docker ≥ 26 与 compose ≥ $MIN_COMPOSE 后用 --check 自检"
    printf '%s发行版：%s（%s 家族，包管理器 %s）%s\n' "$C_INFO" "$OS_NAME" "$FAMILY" "$PKG" "$C_END"
    install_base
    install_docker
    configure_daemon
    setup_user
    configure_firewall
    tune_system
    clone_repo
    report
    next_steps
  fi

  if (( ${#WARNINGS[@]} > 0 )); then
    printf '\n%s需要留意（%d 项）：%s\n' "$C_WARN" "${#WARNINGS[@]}" "$C_END"
    printf '  - %s\n' "${WARNINGS[@]}"
  else
    printf '\n%s全部检查通过%s\n' "$C_OK" "$C_END"
  fi
}

main
