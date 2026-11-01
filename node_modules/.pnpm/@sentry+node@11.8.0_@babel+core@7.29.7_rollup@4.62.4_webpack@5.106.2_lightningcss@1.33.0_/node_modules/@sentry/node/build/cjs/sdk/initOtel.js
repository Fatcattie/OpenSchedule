Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const api = require('@opentelemetry/api');
const core = require('@sentry/core');
const logger = require('../otel/logger.js');
const opentelemetry = require('@sentry/opentelemetry');
const debugBuild = require('../debug-build.js');

const OTEL_API_GLOBAL_KEY = /* @__PURE__ */ Symbol.for("opentelemetry.js.api.1");
function registerGlobalTracerProvider(provider) {
  if (api.trace.setGlobalTracerProvider(provider)) {
    return true;
  }
  const otelGlobal = globalThis;
  const registry = otelGlobal[OTEL_API_GLOBAL_KEY];
  if (registry && !registry.trace) {
    debugBuild.DEBUG_BUILD && core.debug.warn(
      "Replaced a pre-existing OpenTelemetry API registry that was created by a different @opentelemetry/api version and would have blocked tracing. If you want to manage OpenTelemetry yourself, set `enableOpenTelemetrySetup: false` in `Sentry.init()`."
    );
    otelGlobal[OTEL_API_GLOBAL_KEY] = void 0;
    if (!api.trace.setGlobalTracerProvider(provider)) {
      return false;
    }
    const recreatedRegistry = otelGlobal[OTEL_API_GLOBAL_KEY];
    if (recreatedRegistry) {
      const { propagation: _propagation, context: _context, ...carriedOverSlots } = registry;
      otelGlobal[OTEL_API_GLOBAL_KEY] = { ...carriedOverSlots, ...recreatedRegistry };
    }
    return true;
  }
  return false;
}
function initOpenTelemetry(client) {
  if (client.getOptions().debug) {
    logger.setupOpenTelemetryLogger();
  }
  const provider = setupOtel();
  client.traceProvider = provider;
}
function setupOtel() {
  const provider = new opentelemetry.SentryTracerProvider();
  if (!registerGlobalTracerProvider(provider)) {
    debugBuild.DEBUG_BUILD && core.debug.warn(
      "Could not register SentryTracerProvider because another OpenTelemetry tracer provider is already registered."
    );
    return void 0;
  }
  api.propagation.setGlobalPropagator(new opentelemetry.SentryPropagator());
  return provider;
}

exports.initOpenTelemetry = initOpenTelemetry;
exports.setupOtel = setupOtel;
//# sourceMappingURL=initOtel.js.map
