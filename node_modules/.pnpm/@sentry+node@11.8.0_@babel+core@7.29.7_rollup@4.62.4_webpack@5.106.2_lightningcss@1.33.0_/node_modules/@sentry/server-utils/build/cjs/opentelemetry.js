Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const api = require('@opentelemetry/api');
const core = require('@sentry/core');

const INTEGRATION_NAME = "OpenTelemetry";
const _openTelemetryIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      core.registerExternalPropagationContext(() => {
        const activeSpan = api.trace.getActiveSpan();
        if (!activeSpan) {
          return void 0;
        }
        const spanContext = activeSpan.spanContext();
        if (!api.isSpanContextValid(spanContext)) {
          return void 0;
        }
        const { traceId, spanId } = spanContext;
        return { traceId, spanId };
      });
    }
  };
});
const openTelemetryIntegration = core.defineIntegration(_openTelemetryIntegration);
function getOtlpTracesEndpoint(dsn) {
  const parsedDsn = core.dsnFromString(dsn);
  if (!parsedDsn) {
    return void 0;
  }
  const { protocol, host, port, path, projectId, publicKey } = parsedDsn;
  const basePath = path ? `/${path}` : "";
  const portSuffix = port ? `:${port}` : "";
  return {
    url: `${protocol}://${host}${portSuffix}${basePath}/api/${projectId}/integration/otlp/v1/traces/`,
    headers: {
      "X-Sentry-Auth": `Sentry sentry_version=${core.SENTRY_API_VERSION}, sentry_key=${publicKey}`
    }
  };
}

exports.getOtlpTracesEndpoint = getOtlpTracesEndpoint;
exports.openTelemetryIntegration = openTelemetryIntegration;
//# sourceMappingURL=opentelemetry.js.map
