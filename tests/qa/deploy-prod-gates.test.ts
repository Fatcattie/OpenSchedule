'use strict';

/**
 * R10 生产部署与运维契约门禁（本地/发布前；与 tests/qa/* 其它门禁同构，静态断言源码契约）。
 *
 * 覆盖 R10 任务清单：
 *  1. 生产编排（ADR D-02 = A：单机 compose 分层）——deploy/docker-compose.prod.yml
 *     仅 caddy 对外发布端口 / 无源码挂载 / restart+healthcheck+资源上限+日志轮转 / 命名卷已声明
 *  2. 配置 fail-fast：关键密钥一律 ${VAR:?}，且 ${VAR:?} 清单必须与 deploy/.env.production.example 一致
 *  3. web 生产镜像：apps/web/Dockerfile 的 prod 目标（nginx 静态托管 + VITE_USE_MOCK=false + dist）
 *  4. 反向代理与 TLS：deploy/caddy/Caddyfile（/api/* → api:3000、/metrics 403、其余 → web:80、HSTS）
 *  5. AI 模型凭据（D-14）：部署配置不含任何模型 key（已移除 LiteLLM）；key 由管理员在设置页配置、库内加密
 *  6. CD 流水线：.github/workflows/release.yml（三镜像 → staging（目标机迁移+校验+滚动）→ production 人工 gate）
 *  7. 备份与恢复演练：pg-backup job + docs/ops/runbook.md（10 条告警处置 + restore/verify 流程）
 *  8. 不回归：ci.yml 的 migration/备份恢复步骤仍在；.gitignore 仍只放行模板不放行 .env.production
 *  9. staging 演练包（R10-2）
 * 10. 服务器初始化与密钥生成（R10-3）：deploy/server/bootstrap.sh（Debian/RHEL 系兼容）+ gen-env.sh
 * 断言只读源码文本 / 解析 YAML，不启动进程、不需要 Docker（环境无关）。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
// yaml 由 services/api 的依赖提供（与 observability-gates 的降级策略一致：能用则解析，否则不阻塞）
const yaml = require(path.join(ROOT, 'services', 'api', 'node_modules', 'yaml'));

function read(...segments) {
  const filePath = path.join(ROOT, ...segments);
  assert.ok(fs.existsSync(filePath), `R10 契约文件不存在: ${path.relative(ROOT, filePath)}`);
  return fs.readFileSync(filePath, 'utf8');
}

function parseYaml(raw, label) {
  try {
    return yaml.parse(raw);
  } catch (err) {
    assert.fail(`${label} 不是合法 YAML：${err.message}`);
  }
}

/** 去掉整行注释（负向断言只针对生效配置，避免把说明文字里的示例值误判为占位值） */
function stripLineComments(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => (/^\s*#/.test(line) ? '' : line))
    .join('\n');
}

function run() {
  // ═══════════ 1. 生产编排（compose 分层 / 端口收敛 / 生产硬化） ═══════════
  const composeRaw = read('deploy', 'docker-compose.prod.yml');
  const compose = parseYaml(composeRaw, 'deploy/docker-compose.prod.yml');
  assert.equal(compose.name, 'openschedule-prod', '生产栈须独立命名（与开发栈 openschedule 隔离）');
  const services = compose.services;

  // 仅 caddy 对外发布端口（pg/redis/minio/api/ai 一律不映射宿主端口）
  const publishers = Object.entries(services)
    .filter(([, svc]) => Array.isArray(svc.ports) && svc.ports.length > 0)
    .map(([name]) => name);
  assert.deepEqual(publishers, ['caddy'], `只有 caddy 可对外发布端口，实际：${publishers.join(',')}`);

  // 常驻服务：restart + 资源上限 + 日志轮转（防单机磁盘打满）
  const longRunning = ['postgres', 'redis', 'minio', 'api', 'web', 'ai', 'caddy', 'prometheus', 'grafana', 'alertmanager', 'alert-bridge', 'pg-backup'];
  for (const name of longRunning) {
    const svc = services[name];
    assert.ok(svc, `生产栈缺少常驻服务：${name}`);
    assert.equal(svc.restart, 'unless-stopped', `${name} 必须 restart: unless-stopped`);
    assert.ok(svc.logging, `${name} 必须配置日志轮转`);
    assert.ok(svc.deploy?.resources?.limits?.cpus && svc.deploy?.resources?.limits?.memory, `${name} 必须声明资源上限`);
  }

  // 健康检查：基础设施 + 告警转发显式声明；api/web/ai 由镜像 HEALTHCHECK 提供
  for (const name of ['postgres', 'redis', 'minio', 'alert-bridge']) {
    assert.ok(services[name].healthcheck?.test, `${name} 必须配置健康检查`);
  }
  // 应用服务无源码挂载（生产镜像不可变）
  for (const name of ['api', 'web', 'ai']) {
    assert.equal(services[name].volumes, undefined, `${name} 生产不得挂载源码/构建产物（镜像必须自包含）`);
  }
  // 命名卷必须已在顶层声明（防 typo：pgbackups vs pgbackup）
  const declaredVolumes = new Set(Object.keys(compose.volumes ?? {}));
  for (const [name, svc] of Object.entries(services)) {
    for (const mount of svc.volumes ?? []) {
      const spec = typeof mount === 'string' ? mount : mount.source;
      if (!spec || spec.startsWith('.') || spec.startsWith('/')) continue; // 宿主路径/相对挂载
      const volumeName = String(spec).split(':')[0];
      assert.ok(declaredVolumes.has(volumeName), `${name} 引用了未声明的命名卷：${volumeName}`);
    }
  }

  // 生产语义：不自动迁移、指标开启、AI 经网关、前端同源
  assert.equal(services.api.environment.DB_AUTO_MIGRATE, 'false', '生产必须关闭应用启动自动迁移（改由 migrate job）');
  assert.equal(services.api.environment.NODE_ENV, 'production');
  assert.equal(services.api.environment.METRICS_ENABLED, 'true', '生产须开启 /metrics（Prometheus 抓取）');
  assert.match(services.api.environment.AI_SERVICE_URL, /^http:\/\/ai:/, 'api 须经内部网络访问 ai 服务');
  assert.equal(services.litellm, undefined, 'D-14：已移除 LiteLLM，AI 服务按租户配置直连厂商');
  assert.ok(!Object.keys(services.ai.environment).some((k) => /LITELLM|_API_KEY$/.test(k)), 'ai 部署配置不得含模型端点/凭据（随请求下发）');
  // R11：AI run 状态/回调死信必须跨重启保留 → 生产强制 redis（fail-fast），且挂在同一 redis 上
  assert.equal(services.ai.environment.AI_RUN_STORE, 'redis', '生产 AI 必须以 redis 持久化 run 状态（连不上即启动失败）');
  assert.equal(services.ai.environment.AI_STATE_REDIS_URL, 'redis://redis:6379/3', 'AI 状态存储须用独立 DB（与主服务逻辑隔离）');
  assert.ok(services.ai.depends_on?.redis, 'ai 须依赖 redis 健康（否则 run 状态无法持久化）');
  assert.ok(services.web.build?.target === 'prod', 'web 必须构建 prod 目标（nginx 静态托管）');

  // 镜像不落 latest（不可变 tag；REGISTRY/IMAGE_TAG fail-fast）
  for (const [name, svc] of Object.entries(services)) {
    const image = String(svc.image ?? '');
    assert.ok(image.length > 0, `${name} 必须声明镜像`);
    assert.ok(!/:latest$/.test(image), `${name} 镜像不得使用 :latest（生产必须可回滚到不可变 tag）`);
  }

  // ═══════════ 2. 配置 fail-fast 与模板一致性 ═══════════
  const failFastVars = [...stripLineComments(composeRaw).matchAll(/\$\{([A-Z0-9_]+):\?/g)].map((m) => m[1]);
  assert.ok(failFastVars.length >= 8, `关键密钥须用 \${VAR:?} fail-fast（实际 ${failFastVars.length} 处）`);
  for (const required of ['REGISTRY', 'IMAGE_TAG', 'DOMAIN', 'ACME_EMAIL', 'POSTGRES_PASSWORD', 'GRAFANA_ADMIN_PASSWORD']) {
    assert.ok(failFastVars.includes(required), `关键变量须 fail-fast：${required}`);
  }
  assert.ok(!/change-me/.test(stripLineComments(composeRaw)), '生产编排不得出现 change-me 占位值');
  assert.ok(
    !/\$\{[A-Z0-9_]*(PASSWORD|SECRET|_KEY|TOKEN)[A-Z0-9_]*:-[^}]/.test(stripLineComments(composeRaw)),
    '生产编排不得为口令/密钥类变量提供非空默认值（须 fail-fast 或显式留空）',
  );

  const envExample = read('deploy', '.env.production.example');
  for (const name of new Set(failFastVars)) {
    assert.match(envExample, new RegExp(`^${name}=`, 'm'), `.env.production.example 缺少 fail-fast 变量：${name}`);
  }
  assert.match(read('.gitignore'), /^!deploy\/\.env\.production\.example$/m, '.gitignore 必须放行生产密钥**模板**（真实值仍排除）');

  // ═══════════ 3. web 生产镜像（nginx 静态托管） ═══════════
  const webDockerfile = read('apps', 'web', 'Dockerfile');
  assert.match(webDockerfile, /^FROM nginx:[\d.]+-alpine AS prod$/m, 'web 生产运行层须为 nginx');
  assert.match(webDockerfile, /ENV VITE_USE_MOCK=false/, '生产构建必须锁死 VITE_USE_MOCK=false（假数据不得上线）');
  assert.match(webDockerfile, /pnpm --filter "\.\/apps\/web" run build/, '生产须执行前端构建');
  assert.match(webDockerfile, /apps\/web\/dist /, '产物目录须为 apps/web/dist');
  assert.ok(!/dist-mvp/.test(stripLineComments(webDockerfile)), 'Dockerfile 生效指令不得残留历史 dist-mvp-* 路径');
  assert.match(webDockerfile, /HEALTHCHECK[\s\S]*\/health/, 'web 生产镜像须有 /health 健康检查');

  const nginxConf = read('deploy', 'web', 'nginx.conf');
  assert.match(nginxConf, /location = \/health/, 'nginx 须提供 /health（容器健康检查）');
  assert.match(nginxConf, /try_files \$uri \$uri\/ \/index\.html/, 'SPA 路由须回退 index.html');
  assert.match(nginxConf, /assets\/[\s\S]*immutable/, '带指纹产物须长缓存（immutable）');
  assert.ok(!/proxy_pass/.test(nginxConf), 'API 反向代理只由 Caddy 承担（避免双层代理路径歧义）');

  // ═══════════ 4. 反向代理与 TLS（Caddy） ═══════════
  const caddyfile = read('deploy', 'caddy', 'Caddyfile');
  assert.match(caddyfile, /@backend path \/api\/\* \/health/, '须把 /api/* 与 /health 路由到后端');
  assert.match(caddyfile, /reverse_proxy @backend api:3000/, '后端上游须为内部服务名 api:3000');
  assert.match(caddyfile, /@metrics path \/metrics[\s\S]*?respond @metrics 403/, '公网 /metrics 必须拒绝（仅内网抓取）');
  assert.match(caddyfile, /reverse_proxy web:80/, '其余路径须回落到前端静态站点');
  assert.match(caddyfile, /Strict-Transport-Security/, '须下发 HSTS');
  assert.match(caddyfile, /email \{\$ACME_EMAIL\}/, 'ACME 邮箱须来自环境变量（缺失即 compose 失败）');

  // ═══════════ 5. AI 模型凭据（D-14：管理员在设置页配置，部署配置零模型 key） ═══════════
  assert.ok(!fs.existsSync(path.join(ROOT, 'deploy', 'litellm')), 'D-14：deploy/litellm 已移除（不再部署网关）');
  for (const vendorKey of ['LITELLM_MASTER_KEY', 'DEEPSEEK_API_KEY', 'ZHIPUAI_API_KEY', 'OPENAI_API_KEY']) {
    assert.ok(!composeRaw.includes(vendorKey), `生产编排不得出现模型凭据变量：${vendorKey}`);
    assert.ok(!new RegExp(`^${vendorKey}=`, 'm').test(read('deploy', '.env.production.example')), `生产模板不得要求模型凭据：${vendorKey}`);
  }
  const llmService = read('services', 'api', 'src', 'modules', 'llm', 'llm-config.service.ts');
  assert.match(llmService, /this\.cipher\.encrypt\(apiKey\)/, '租户模型 key 必须加密落库（CredentialCipher）');
  assert.match(llmService, /assertSafeOutboundUrl/, '租户模型地址须过 SSRF 守卫');
  assert.match(read('services', 'ai', 'app', 'schemas', 'decompose.py'), /llm: LlmTarget \| None = Field\(default=None, exclude=True\)/, 'AI 服务不得序列化租户模型配置');
  // ═══════════ 6. CD 流水线（镜像 + 迁移 job + staging 自动 / prod gate） ═══════════
  const releaseRaw = read('.github', 'workflows', 'release.yml');
  const release = parseYaml(releaseRaw, '.github/workflows/release.yml');
  const jobs = release.jobs;
  for (const job of ['build-images', 'deploy', 'deploy-production']) {
    assert.ok(jobs[job], `release.yml 缺少 job：${job}`);
  }
  // 生产 PG 不对外暴露：迁移不得在 runner 上直连数据库（须在目标机经 compose migrate 执行）
  assert.ok(!jobs.migrate, 'release.yml 不得设 runner 直连数据库的 migrate job');
  assert.ok(!releaseRaw.includes('secrets.DATABASE_URL'), 'release.yml 不得依赖 secrets.DATABASE_URL');
  assert.ok(JSON.stringify(release.on.push.tags).includes('v*'), 'release.yml 须由 v* tag 触发');
  // 三镜像都构建且 web 用 prod 目标
  for (const target of ['services/api/Dockerfile', 'apps/web/Dockerfile', 'services/ai/Dockerfile']) {
    assert.ok(releaseRaw.includes(target), `release.yml 须构建镜像：${target}`);
  }
  assert.match(releaseRaw, /file: apps\/web\/Dockerfile\s*\n\s*target: prod/, 'web 镜像须构建 prod 目标（静态托管）');
  // 迁移先于部署（上线顺序不可颠倒）
  assert.ok(jobs.deploy.needs.includes('build-images'), 'deploy 须依赖镜像构建');
  assert.ok(jobs['deploy-production'].needs.includes('deploy'), '生产发布须在 staging 发布之后');
  for (const job of ['deploy', 'deploy-production']) {
    const script = JSON.stringify(jobs[job].steps);
    const migrateAt = script.indexOf('run --rm migrate');
    const statusAt = script.indexOf('run --rm migrate npx prisma migrate status');
    const upAt = script.indexOf('up -d --remove-orphans');
    assert.ok(migrateAt >= 0 && statusAt > migrateAt && upAt > statusAt, `${job} 须先迁移、再校验迁移状态、后滚动应用`);
  }
  // 生产发布必须挂在受保护的 GitHub Environment 上（人工 gate）
  assert.equal(jobs['deploy-production'].environment.name, 'production', '生产发布须走 production Environment（审批 gate）');
  assert.ok(releaseRaw.includes('run --rm migrate'), '发布编排须先跑迁移 job');
  assert.match(releaseRaw, /up -d --remove-orphans/, '须以编排拉起生产栈');
  assert.ok(!/change-me|BEGIN [A-Z ]*PRIVATE KEY/.test(releaseRaw), '流水线不得含明文密钥（一律 ${{ secrets.* }}）');
  assert.ok(!/pull_request_target/.test(releaseRaw), '发布流水线不得使用 pull_request_target');

  // ═══════════ 7. 备份 + 恢复演练 + runbook ═══════════
  assert.deepEqual(services.migrate.profiles, ['tools'], '迁移须为按需 job（不随 api 启动自动跑）');
  assert.ok(services.migrate.command.join(' ').includes('prisma migrate deploy'), 'migrate job 须执行 migrate deploy');
  assert.deepEqual(services['pg-backup'].profiles, ['ops'], '备份须为 ops profile job');
  assert.ok(
    (services['pg-backup'].volumes ?? []).some((v) => String(v).includes('postgres/backup.sh')),
    '备份 job 须复用 deploy/postgres/backup.sh（与 CI 同源脚本）',
  );
  assert.match(services['pg-backup'].command.join(' '), /BACKUP_RETAIN_DAYS/, '备份须有保留期清理（防磁盘打满）');

  const runbook = read('docs', 'ops', 'runbook.md');
  const alertNames = [
    'ApiDown', 'ApiHighErrorRate', 'ApiHighLatencyP95', 'ApiInFlightSaturation',
    'DbSlowQuerySpike', 'RedisDegraded', 'ApiEventLoopLagHigh', 'ApiHeapUsedHigh',
    'AiCallbackDeadLetters', 'AiRunStoreDegraded',
  ];
  for (const alert of alertNames) {
    assert.ok(runbook.includes(alert), `runbook 须覆盖告警处置：${alert}`);
  }
  for (const needed of ['restore.sh', 'verify-restore.sh', 'IMAGE_TAG', 'D-02', '.env.production', '回滚']) {
    assert.ok(runbook.includes(needed), `runbook 缺少必备内容：${needed}`);
  }
  // 告警名必须与 alerts.yml 实际一致（防 runbook 写臆造告警）
  const alertsYml = read('deploy', 'observability', 'alerts.yml');
  for (const alert of alertNames) {
    assert.ok(alertsYml.includes(`alert: ${alert}`), `alerts.yml 未定义告警：${alert}`);
  }

  // ═══════════ 8. 不回归（CI 迁移/备份步骤 + 构建期变量） ═══════════
  const ciRaw = read('.github', 'workflows', 'ci.yml');
  assert.ok(ciRaw.includes('migration:'), 'ci.yml 的 migration 门禁不得被破坏');
  assert.ok(ciRaw.includes('deploy/postgres/backup.sh') && ciRaw.includes('deploy/postgres/verify-restore.sh'), 'CI 备份恢复演练步骤不得被破坏');
  const ci = parseYaml(ciRaw, '.github/workflows/ci.yml');
  assert.ok(ci.jobs.lint && ci.jobs['api-test'] && ci.jobs['ai-test'] && ci.jobs.migration, 'ci.yml 核心门禁 job 不得缺失');

  // ═══════════ 9. staging 首次部署演练包（R10-2：把"从未实跑"变成可取证） ═══════════
  const drill = read('deploy', 'drill', 'run.mjs');
  for (const stepId of ['config', 'images', 'migrate', 'up', 'ps']) {
    assert.ok(drill.includes(`id: '${stepId}'`), `演练编排缺少步骤：${stepId}`);
  }
  for (const stepId of ['smoke', 'backup', 'restore', 'rollback']) {
    assert.ok(drill.includes(`record('${stepId}'`), `演练编排缺少取证步骤：${stepId}`);
  }
  assert.match(drill, /function writeReport/, '演练须有报告落盘步骤（report）');
  assert.ok(drill.includes('--dry-run'), '演练必须支持无 Docker 的 --dry-run（本机可验证）');
  assert.match(drill, /verdict:[\s\S]*?DRY_RUN_OK[\s\S]*?PASS[\s\S]*?FAIL/, '演练报告须有明确 verdict（DRY_RUN_OK/PASS/FAIL）');
  assert.ok(drill.includes('deploy/drill/evidence') || drill.includes("'drill'"), '演练须落盘证据报告');
  assert.ok(drill.includes('verify-restore.sh') && drill.includes('restore.sh') && drill.includes('backup.sh'), '恢复演练须复用 R1 的备份/恢复/校验脚本');
  assert.match(drill, /os_drill/, '恢复演练必须落到隔离库（不得覆盖生产库）');
  assert.ok(drill.includes('--rollback-tag') && drill.includes('--skip-rollback'), '回滚演练须可指定旧 tag / 可跳过');
  assert.ok(drill.includes('/metrics'), '冒烟须含公网 /metrics 拒绝（403）断言');
  const drillDoc = read('docs', 'ops', 'staging-drill.md');
  for (const k of ['§4.1 #1', '§4.1 #3', '§4.1 #4', '--dry-run', 'RTO']) {
    assert.ok(drillDoc.includes(k), `staging 演练文档缺少：${k}`);
  }
  assert.match(read('.gitignore'), /^deploy\/drill\/evidence\/$/m, '演练证据报告属运行产物，须 gitignore');
  const rootPkg = JSON.parse(read('package.json'));
  assert.ok(rootPkg.scripts['drill:dry'] && rootPkg.scripts.drill, '根脚本须提供 drill:dry / drill');

  // ═══════════ 10. 服务器初始化与密钥生成（R10-3：云主机 compose 落地的一次性准备） ═══════════
  const bootstrap = read('deploy', 'server', 'bootstrap.sh');
  const genEnv = read('deploy', 'server', 'gen-env.sh');
  for (const [label, src] of [['bootstrap.sh', bootstrap], ['gen-env.sh', genEnv]]) {
    assert.ok(src.startsWith('#!/usr/bin/env bash\n'), `${label} 须为 bash 脚本且 LF 换行`);
    assert.ok(!src.includes('\r'), `${label} 不得含 CRLF（Linux 上会报 $'\\r': command not found）`);
    assert.match(src, /^set -euo pipefail$/m, `${label} 须 set -euo pipefail`);
  }
  // 发行版兼容：Debian 系与 RHEL 系两条安装路径 + 回落
  assert.ok(bootstrap.includes('apt-get') && /dnf|yum/.test(bootstrap), 'bootstrap 须同时支持 apt 与 dnf/yum');
  for (const distro of ['ubuntu', 'debian', 'rhel', 'centos', 'alinux', 'anolis', 'opencloudos']) {
    assert.ok(bootstrap.includes(distro), `bootstrap 须识别发行版：${distro}`);
  }
  assert.match(bootstrap, /install_docker_fallback/, 'docker-ce 源不可用时须回落到发行版自带 docker');
  // compose ≥ 2.24：prod 编排的 env_file path/required 长语法依赖它
  assert.ok(services.api.env_file.some((e) => e.path && e.required === true), 'prod 编排使用 env_file.path/required（compose ≥ 2.24）');
  assert.match(bootstrap, /MIN_COMPOSE="2\.24\.0"/, 'bootstrap 须校验 compose ≥ 2.24');
  // 与 release.yml 约定一致：部署用户在 docker 组、仓库在 ~/openschedule
  assert.ok(releaseRaw.includes('$HOME/openschedule') && bootstrap.includes('/openschedule"'), '部署目录须与 release.yml 的 ~/openschedule 一致');
  assert.match(bootstrap, /usermod -aG docker/, '部署用户须加入 docker 组（CI 以该用户执行 compose）');
  assert.match(bootstrap, /vm\.overcommit_memory = 1/, 'redis 持久化需要 vm.overcommit_memory=1');
  assert.ok(!/ufw (--force )?enable|systemctl (enable|start)[^\n]*firewalld/.test(bootstrap), 'bootstrap 不得擅自启用防火墙（避免锁死 SSH）');
  // gen-env：覆盖全部 fail-fast 密钥、不重生成已有值、口令 URL 安全、文件 600
  for (const key of ['POSTGRES_PASSWORD', 'MINIO_ROOT_PASSWORD', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY', 'AI_SERVICE_TOKEN', 'GRAFANA_ADMIN_PASSWORD']) {
    assert.match(genEnv, new RegExp(`^gen_secret ${key} `, 'm'), `gen-env 须生成密钥：${key}`);
    assert.match(envExample, new RegExp(`^${key}=$`, 'm'), `模板中 ${key} 须留空（由 gen-env 生成，杜绝示例值）`);
  }
  assert.match(genEnv, /^gen_secret POSTGRES_PASSWORD hex /m, 'POSTGRES_PASSWORD 拼进 DATABASE_URL，须用 hex（base64 的 + \/ = 会破坏连接串）');
  assert.match(genEnv, /^gen_secret ENCRYPTION_KEY b64 32$/m, 'ENCRYPTION_KEY 须为 32 字节 base64（AES-256-GCM）');
  assert.match(genEnv, /if \[\[ -n "\$cur" \]\]; then[\s\S]*?return/, 'gen-env 已有密钥不得重新生成（改库口令/加密密钥会导致数据不可用）');
  assert.match(genEnv, /chmod 600 "\$OUT"/, '.env.production 须为 600 权限');
  for (const key of ['DOMAIN', 'ACME_EMAIL', 'REGISTRY', 'IMAGE_TAG']) {
    assert.match(genEnv, new RegExp(`^resolve_param ${key} `, 'm'), `gen-env 须处理部署参数：${key}`);
  }

  console.log('deploy-prod-gates: R10 生产编排/密钥 fail-fast/web 生产镜像/反代 TLS/AI 模型凭据/CD/备份 runbook/演练包/服务器初始化 契约断言通过');
}

run();
