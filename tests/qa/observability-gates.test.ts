'use strict';

/**
 * R9 可观测性契约门禁（本地/发布前；与 tests/qa/* 其它门禁同构，静态断言源码契约）。
 *
 * 覆盖四类要求：
 *  1. 结构化日志：pino 依赖 + AppLogger 接管框架日志 + 凭据字段脱敏（§3.3）；
 *  2. 请求溯源：访问日志携带 requestId（X-Request-Id）；
 *  3. 慢查询：SLOW_QUERY_MS 可配 + 日志 + 指标同源；
 *  4. 指标端点：/metrics 公开（@Public）+ 排除全局前缀 + METRICS_ENABLED 可关闭。
 * 断言只读源码文本，不启动进程（环境无关，可在无 DB/Redis 时运行）。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const API = path.join(ROOT, 'services', 'api');

function read(...segments) {
  const filePath = path.join(...segments);
  assert.ok(fs.existsSync(filePath), `可观测性契约文件不存在: ${path.relative(ROOT, filePath)}`);
  return fs.readFileSync(filePath, 'utf8');
}

function run() {
  const pkg = JSON.parse(read(API, 'package.json'));
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const main = read(API, 'src', 'main.ts');
  const commonModule = read(API, 'src', 'common', 'common.module.ts');
  const pinoLogger = read(API, 'src', 'common', 'observability', 'pino-logger.ts');
  const metrics = read(API, 'src', 'common', 'observability', 'metrics.ts');
  const metricsController = read(API, 'src', 'common', 'observability', 'metrics.controller.ts');
  const httpMiddleware = read(API, 'src', 'common', 'middleware', 'http-observability.middleware.ts');
  const slowQuery = read(API, 'src', 'common', 'prisma', 'slow-query.extension.ts');
  const prismaService = read(API, 'src', 'common', 'prisma', 'prisma.service.ts');
  const redisService = read(API, 'src', 'common', 'redis', 'redis.service.ts');
  const envExample = read(API, '.env.example');
  const rootEnvExample = read('.env.example');

  // ---- 1. 结构化日志（pino）----
  assert.ok(deps.pino, '必须引入 pino 作为结构化日志实现');
  assert.match(main, /bufferLogs:\s*true/, '启动须先缓冲日志再交由 AppLogger 输出');
  assert.match(main, /app\.useLogger\(app\.get\(AppLogger\)\)/, '框架日志必须接管到 AppLogger（pino JSON）');
  assert.match(commonModule, /provide:\s*PINO_LOGGER/, 'pino 单例须显式 token 注册（不依赖 emitDecoratorMetadata）');

  // 凭据脱敏：Authorization/Cookie 与密码类字段一律 [REDACTED]（§3.3 凭据边界）
  for (const field of ['password', 'newPassword', 'refreshToken']) {
    assert.match(pinoLogger, new RegExp(`'${field}'`), `日志脱敏必须覆盖凭据字段: ${field}`);
  }
  assert.match(pinoLogger, /req\.headers\.authorization/, '日志脱敏必须覆盖 Authorization 头');
  assert.match(pinoLogger, /req\.headers\.cookie/, '日志脱敏必须覆盖 Cookie 头');
  assert.match(pinoLogger, /censor:\s*'\[REDACTED\]'/, '脱敏必须替换为 [REDACTED] 而非丢弃字段');

  // ---- 2. 请求溯源：访问日志带 requestId ----
  assert.match(httpMiddleware, /res\.on\('finish'/, '访问日志须在响应 finish 时收口');
  assert.match(httpMiddleware, /res\.on\('close'/, '客户端中断（仅 close）也须收口，避免在途计数泄漏');
  assert.match(httpMiddleware, /requestId/, '访问日志必须携带 requestId（X-Request-Id 同一值）');
  assert.match(httpMiddleware, /event:\s*'http_request'/, '访问日志须有稳定的 event 字段便于检索');
  assert.match(httpMiddleware, /status\s*>=\s*500\s*\?\s*'error'/, '5xx 必须记 error 级别');
  assert.match(httpMiddleware, /normalizeRouteLabel/, '路由标签必须归一化（防标签基数爆炸）');

  // ---- 3. 慢查询：阈值可配 + 日志 + 指标同源 ----
  assert.match(envExample, /^SLOW_QUERY_MS=/m, '.env.example 必须记录 SLOW_QUERY_MS');
  assert.match(slowQuery, /resolveSlowQueryMs\(\)/, '慢查询阈值须取自可配置解析器（默认 200ms）');
  assert.match(slowQuery, /durationMs\s*>=\s*thresholdMs/, '仅超阈值才记录慢查询');
  assert.match(slowQuery, /event:\s*'db_slow_query'/, '慢查询须记结构化日志（event=db_slow_query）');
  assert.match(slowQuery, /recordSlowQuery\(/, '慢查询须同步递增指标（日志与指标同源）');
  assert.match(prismaService, /\$extends\(tenantFilterExtension\)\.\$extends\(slowQueryExtension\)/, '租户过滤与慢查询扩展须链式组合');

  // ---- 4. 指标端点 ----
  assert.ok(deps['@prometheus-io/client'], '必须引入 @prometheus-io/client（prom-client 的官方后继）暴露指标');
  assert.match(metricsController, /@Public\(\)/, '/metrics 必须免认证（部署侧抓取器不带 JWT）');
  assert.match(metricsController, /resolveMetricsEnabled\(\)/, '/metrics 须可经 METRICS_ENABLED 关闭');
  assert.match(main, /exclude:\s*\[[^\]]*'metrics'/, '/metrics 必须排除 /api/v1 全局前缀');
  assert.match(metrics, /openschedule_http_requests_total/, '必须暴露 HTTP 请求计数（RED Rate）');
  assert.match(metrics, /openschedule_http_request_duration_seconds/, '必须暴露请求耗时直方图（RED Duration）');
  assert.match(metrics, /openschedule_db_slow_queries_total/, '必须暴露慢查询计数指标');
  assert.match(metrics, /collectDefaultMetrics\(\{[^}]*prefix:\s*'openschedule_'/, '运行时默认指标须统一前缀便于抓取规则');

  // .env.example 必须与解析器一致；根 .env.example 是 compose `env_file` 的真正来源，
  // 必须同步，否则容器内 /metrics 与慢查询阈值不可配。
  for (const name of ['LOG_LEVEL', 'METRICS_ENABLED', 'SLOW_QUERY_MS']) {
    assert.match(envExample, new RegExp(`^${name}=`, 'm'), `services/api/.env.example 必须记录 ${name}`);
    assert.match(rootEnvExample, new RegExp(`^${name}=`, 'm'), `根 .env.example（compose env_file）必须记录 ${name}`);
  }

  // 系统级事件指标不能是死代码：Redis 降级必须真的上报（否则告警无信号）。
  assert.match(metrics, /recordSystemEvent/, '必须提供系统级事件上报入口');
  assert.match(redisService, /recordSystemEvent\('redis_degraded'\)/, 'Redis 进入降级冷却必须上报 redis_degraded 事件');

  // ---- 5. 错误上报（Sentry Envelope 直连，零依赖） ----
  const sentry = read(API, 'src', 'common', 'observability', 'sentry.ts');
  const exceptionFilter = read(API, 'src', 'common', 'filters', 'http-exception.filter.ts');
  assert.match(main, /initSentry\(process\.env\)/, '启动必须初始化错误上报（无 DSN 时内部 no-op）');
  assert.match(sentry, /export function parseSentryDsn/, '必须能解析 SENTRY_DSN（公钥/项目号/envelope 地址）');
  assert.match(sentry, /\/envelope\//, '必须走 Sentry 官方 Envelope 上报地址');
  assert.match(sentry, /x-sentry-auth/i, '必须携带 X-Sentry-Auth（sentry_version=7 + sentry_key）');
  assert.match(sentry, /resolveSentryOptions[\s\S]*?return null/, 'SENTRY_DSN 缺失必须回落 no-op（不得抛错/发起请求）');
  assert.match(sentry, /export function scrubMessage/, '错误消息必须脱敏（§3.3 凭据边界）');
  assert.match(sentry, /export function parseStackFrames/, '必须上报 V8 栈帧（否则 Sentry 只有消息无堆栈）');
  assert.match(sentry, /withinRateLimit|MAX_EVENTS_PER_MINUTE/, '必须有上报限流（防异常风暴）');
  assert.match(exceptionFilter, /captureException\(/, '5xx 必须上报（ExceptionFilter 是唯一统一出口）');
  assert.match(exceptionFilter, /status\s*>=\s*500[\s\S]*?captureException\(/, '仅 5xx 上报，4xx 业务错误不打扰');
  // R9 决策：不上 @sentry/* 官方包（@sentry/node@8 → OTel 自动埋点 8 条 moderate；v11 → fast-uri/brace-expansion 2 条 high）
  const sentryDeps = Object.keys(deps).filter(d => d.startsWith('@sentry/'));
  assert.deepEqual(sentryDeps, [], `错误上报不得依赖 @sentry/*（会引入 OTel 埋点与审计公告）：${sentryDeps.join(', ')}`);
  assert.match(rootEnvExample, /^SENTRY_DSN=/m, '根 .env.example 必须记录 SENTRY_DSN');

  // ---- 6. Prometheus 抓取 + 告警规则 + Grafana 看板 ----
  const observability = path.join(ROOT, 'deploy', 'observability');
  const prometheus = read(observability, 'prometheus.yml');
  const alerts = read(observability, 'alerts.yml');
  const dsProvision = read(observability, 'grafana', 'provisioning', 'datasources', 'prometheus.yml');
  const dashProvision = read(observability, 'grafana', 'provisioning', 'dashboards', 'dashboards.yml');
  const dashboardRaw = read(observability, 'grafana', 'dashboards', 'openschedule-api.json');
  const compose = read('deploy', 'docker-compose.yml');
  const rootPkg = JSON.parse(read('package.json'));

  assert.ok(prometheus.includes('rule_files:'), 'Prometheus 必须加载告警规则文件');
  assert.ok(prometheus.includes('/etc/prometheus/alerts.yml'), 'rule_files 必须指向 alerts.yml');
  assert.ok(/job_name:\s*openschedule-api/.test(prometheus), '抓取 job 名须稳定为 openschedule-api（告警按 job 过滤）');
  assert.ok(/metrics_path:\s*\/metrics/.test(prometheus), '必须抓取 /metrics（非 /api/v1 前缀）');
  assert.ok(/targets:\s*\['api:3000'\]/.test(prometheus), 'compose 网络内须抓取 api:3000');
  assert.ok(/job_name:\s*openschedule-ai/.test(prometheus), 'R11：须抓取 AI 服务指标（死信可告警）');
  assert.ok(/targets:\s*\['ai:8300'\]/.test(prometheus), 'R11：compose 网络内须抓取 ai:8300');

  for (const alert of [
    'ApiDown',
    'ApiHighErrorRate',
    'ApiHighLatencyP95',
    'ApiInFlightSaturation',
    'DbSlowQuerySpike',
    'RedisDegraded',
    'ApiEventLoopLagHigh',
    'ApiHeapUsedHigh',
    'AiCallbackDeadLetters',
    'AiRunStoreDegraded',
  ]) {
    assert.ok(new RegExp(`alert:\\s*${alert}\\b`).test(alerts), `告警规则缺失: ${alert}`);
  }
  assert.match(alerts, /up\{job="openschedule-api"\}\s*==\s*0/, 'ApiDown 必须基于抓取目标 up（同时兜住 /metrics 被关闭的情况）');
  assert.match(alerts, /openschedule_http_requests_total\{status=~"5\.\."\}/, '错误率告警必须用 5xx 计数');
  assert.match(alerts, /openschedule_db_slow_queries_total/, '必须有慢查询告警（与 R9-1 指标同源）');
  assert.match(alerts, /openschedule_system_events_total\{event="redis_degraded"\}/, '必须有 Redis 降级告警');
  assert.match(alerts, /histogram_quantile\(/, '延迟告警必须基于直方图分位');
  assert.ok((alerts.match(/severity:/g) || []).length >= 8, '每条规则都必须带 severity 标签');

  const dashboard = JSON.parse(dashboardRaw);
  assert.ok(Array.isArray(dashboard.panels) && dashboard.panels.length >= 6, '看板须含 RED/慢查询/运行时面板');
  assert.ok(dashboardRaw.includes('openschedule_http_requests_total'), '看板须展示请求速率/错误率');
  assert.ok(dashboardRaw.includes('openschedule_db_slow_queries_total'), '看板须展示慢查询');
  assert.ok(dashboardRaw.includes('openschedule-prometheus'), '看板数据源 uid 须与 provisioning 一致');
  assert.match(dsProvision, /uid:\s*openschedule-prometheus/, '数据源 provisioning 必须固定 uid（供看板引用）');
  assert.match(dashProvision, /path:\s*\/var\/lib\/grafana\/dashboards/, '看板 provisioning 路径须与 compose 挂载一致');

  // ---- 7. compose / 脚本装配（默认不引入观测性容器） ----
  assert.match(compose, /profiles:\s*\["observability"\]/, '观测性容器须挂 profile，避免默认 docker:up 拉起');
  assert.ok(compose.includes('./observability/alerts.yml:/etc/prometheus/alerts.yml:ro'), 'compose 必须挂载告警规则');
  assert.ok(compose.includes('./observability/grafana/provisioning:/etc/grafana/provisioning:ro'), 'compose 必须挂载 Grafana provisioning');
  assert.match(compose, /METRICS_ENABLED:\s*\$\{METRICS_ENABLED:-true\}/, 'api 容器须显式透传 METRICS_ENABLED');
  assert.ok(/^\s+promdata:$/m.test(compose) && /^\s+grafanadata:$/m.test(compose), 'compose 必须声明观测性数据卷');
  assert.ok(rootPkg.scripts['docker:obs'], '根脚本必须提供 docker:obs（一键起观测性栈）');
  assert.match(rootEnvExample, /^GRAFANA_ADMIN_PASSWORD=/m, '根 .env.example 必须记录 GRAFANA_ADMIN_PASSWORD');
  assert.match(read('deploy', 'readme.md'), /pnpm docker:obs/, 'deploy/readme.md 必须记录观测性栈用法');

  // ---- 8. web / AI 两端错误上报（与主服务同口径：Envelope 直连、零新依赖、无 DSN 即 no-op） ----
  const webPkg = JSON.parse(read('apps', 'web', 'package.json'));
  const webDeps = { ...(webPkg.dependencies ?? {}), ...(webPkg.devDependencies ?? {}) };
  assert.deepEqual(Object.keys(webDeps).filter(d => d.startsWith('@sentry/')), [], 'web 错误上报不得依赖 @sentry/*');
  const webReporting = read('apps', 'web', 'src', 'lib', 'errorReporting.ts');
  const webMain = read('apps', 'web', 'src', 'main.tsx');
  assert.match(webReporting, /\/envelope\//, 'web 须走 Sentry Envelope 地址');
  assert.match(webReporting, /export function scrubMessage/, 'web 上报消息须脱敏');
  assert.match(webReporting, /MAX_EVENTS_PER_MINUTE/, 'web 上报须限流');
  assert.match(webReporting, /'unhandledrejection'/, 'web 须捕获未处理的 Promise 拒绝');
  assert.match(webMain, /onCaughtError[\s\S]*onUncaughtError/, 'React 根须接入错误钩子');
  assert.match(read('apps', 'web', 'index.html'), /<script src="\/runtime-config\.js"><\/script>[\s\S]*src\/main\.tsx/, 'runtime-config.js 须先于入口加载');
  assert.match(read('apps', 'web', 'Dockerfile'), /40-runtime-config\.sh \/docker-entrypoint\.d\//, 'web 生产镜像须在启动时注入运行时配置');
  assert.match(read('deploy', 'web', '40-runtime-config.sh'), /WEB_SENTRY_DSN/, '运行时配置须读取 WEB_SENTRY_DSN');
  assert.match(read('deploy', 'web', 'nginx.conf'), /location = \/runtime-config\.js[\s\S]*?no-cache/, 'runtime-config.js 不得被缓存');

  const aiPyproject = read('services', 'ai', 'pyproject.toml');
  assert.ok(!/sentry-sdk/.test(aiPyproject), 'AI 错误上报不得引入 sentry-sdk');
  const aiSentry = read('services', 'ai', 'app', 'services', 'sentry.py');
  assert.match(aiSentry, /\/envelope\//, 'AI 须走 Sentry Envelope 地址');
  assert.match(aiSentry, /def scrub_message/, 'AI 上报消息须脱敏');
  assert.match(read('services', 'ai', 'app', 'main.py'), /exception_handler\(Exception\)[\s\S]*capture_exception/, 'AI 未捕获异常须上报');
  assert.match(read('services', 'ai', 'app', 'routers', 'decompose.py'), /AI_INTERNAL_ERROR:[\s\S]*?capture_exception/, 'AI 拆解只上报非预期异常');
  assert.match(read('services', 'ai', 'app', 'config.py'), /AliasChoices\("AI_SENTRY_DSN", "SENTRY_DSN"\)/, 'AI DSN 须 AI_SENTRY_DSN 优先');
  for (const name of ['VITE_SENTRY_DSN', 'AI_SENTRY_DSN']) {
    assert.match(rootEnvExample, new RegExp(`^${name}=`, 'm'), `根 .env.example 必须记录 ${name}`);
  }

  // ---- 9. 告警通知：Prometheus → Alertmanager → alert-bridge → IM 机器人 ----
  assert.match(prometheus, /alerting:[\s\S]*alertmanager:9093/, 'Prometheus 须把告警推给 Alertmanager');
  // yaml 由 services/api 的依赖提供（与 deploy-prod-gates 同源）
  const yaml = require(path.join(API, 'node_modules', 'yaml'));
  const alertmanagerRaw = read(observability, 'alertmanager.yml');
  const alertmanager = yaml.parse(alertmanagerRaw);
  assert.match(alertmanagerRaw, /url: http:\/\/alert-bridge:9094\/alertmanager/, 'Alertmanager 须投递到 alert-bridge');
  assert.match(alertmanagerRaw, /send_resolved: true/, '恢复也须通知');
  assert.ok(!/https?:\/\/(open\.feishu|oapi\.dingtalk|qyapi\.weixin)/.test(alertmanagerRaw), 'alertmanager.yml 不得内嵌机器人地址（凭据走环境变量）');
  assert.equal(alertmanager.route.receiver, 'im-bridge', '默认路由须到 im-bridge');
  const bridge = read(observability, 'alert-bridge', 'server.mjs');
  for (const name of ['ALERT_FEISHU_WEBHOOK', 'ALERT_DINGTALK_WEBHOOK', 'ALERT_WECOM_WEBHOOK', 'ALERT_WEBHOOK_URL']) {
    assert.ok(bridge.includes(name), `alert-bridge 须支持 ${name}`);
    assert.match(rootEnvExample, new RegExp(`^${name}=`, 'm'), `根 .env.example 必须记录 ${name}`);
  }
  assert.match(bridge, /failed\.length \? 502 : 200/, '任一通道失败须返回 502，交给 Alertmanager 重试');
  assert.ok(/^\s+alertmanager:$/m.test(compose) && /^\s+alert-bridge:$/m.test(compose), 'dev compose 须含 alertmanager 与 alert-bridge');
  assert.ok(/^\s+alertmanagerdata:$/m.test(compose), 'compose 必须声明 alertmanager 数据卷');
  assert.match(rootPkg.scripts['docker:obs'], /alertmanager alert-bridge/, 'docker:obs 须一并拉起告警链路');

  console.log('observability-gates: R9 logging/tracing/slow-query/metrics/sentry/alerting contract assertions passed');
}

run();
