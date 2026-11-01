import { propagation, trace } from '@opentelemetry/api';
import { debug } from '@sentry/core';
import { setupOpenTelemetryLogger } from '../otel/logger.js';
import { SentryTracerProvider, SentryPropagator } from '@sentry/opentelemetry';
import { DEBUG_BUILD } from '../debug-build.js';

const OTEL_API_GLOBAL_KEY = /* @__PURE__ */ Symbol.for("opentelemetry.js.api.1");
function registerGlobalTracerProvider(provider) {
  if (trace.setGlobalTracerProvider(provider)) {
    return true;
  }
  const otelGlobal = globalThis;
  const registry = otelGlobal[OTEL_API_GLOBAL_KEY];
  if (registry && !registry.trace) {
    DEBUG_BUILD && debug.warn(
      "Replaced a pre-existing OpenTelemetry API registry that was created by a different @opentelemetry/api version and would have blocked tracing. If you want to manage OpenTelemetry yourself, set `enableOpenTelemetrySetup: false` in `Sentry.init()`."
    );
    otelGlobal[OTEL_API_GLOBAL_KEY] = void 0;
    if (!trace.setGlobalTracerProvider(provider)) {
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
    setupOpenTelemetryLogger();
  }
  const provider = setupOtel();
  client.traceProvider = provider;
}
function setupOtel() {
  const provider = new SentryTracerProvider();
  if (!registerGlobalTracerProvider(provider)) {
    DEBUG_BUILD && debug.warn(
      "Could not register SentryTracerProvider because another OpenTelemetry tracer provider is already registered."
    );
    return void 0;
  }
  propagation.setGlobalPropagator(new SentryPropagator());
  return provider;
}

export { initOpenTelemetry, setupOtel };
//# sourceMappingURL=initOtel.js.map
