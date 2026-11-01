import { trace, isSpanContextValid } from '@opentelemetry/api';
import { defineIntegration, registerExternalPropagationContext, dsnFromString, SENTRY_API_VERSION } from '@sentry/core';

const INTEGRATION_NAME = "OpenTelemetry";
const _openTelemetryIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      registerExternalPropagationContext(() => {
        const activeSpan = trace.getActiveSpan();
        if (!activeSpan) {
          return void 0;
        }
        const spanContext = activeSpan.spanContext();
        if (!isSpanContextValid(spanContext)) {
          return void 0;
        }
        const { traceId, spanId } = spanContext;
        return { traceId, spanId };
      });
    }
  };
});
const openTelemetryIntegration = defineIntegration(_openTelemetryIntegration);
function getOtlpTracesEndpoint(dsn) {
  const parsedDsn = dsnFromString(dsn);
  if (!parsedDsn) {
    return void 0;
  }
  const { protocol, host, port, path, projectId, publicKey } = parsedDsn;
  const basePath = path ? `/${path}` : "";
  const portSuffix = port ? `:${port}` : "";
  return {
    url: `${protocol}://${host}${portSuffix}${basePath}/api/${projectId}/integration/otlp/v1/traces/`,
    headers: {
      "X-Sentry-Auth": `Sentry sentry_version=${SENTRY_API_VERSION}, sentry_key=${publicKey}`
    }
  };
}

export { getOtlpTracesEndpoint, openTelemetryIntegration };
//# sourceMappingURL=opentelemetry.js.map
