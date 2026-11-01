Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const diagnosticsChannel = require('../utils/diagnosticsChannel.js');
const core = require('@sentry/core');
const debugBuild = require('../debug-build.js');
const detect = require('./detect.js');

const INSTRUMENTED = /* @__PURE__ */ Symbol.for("SentryOrchestrionInstrumented");
const globalAny = globalThis;
const isBun = typeof globalAny.Bun !== "undefined";
const isDeno = typeof globalAny.Deno !== "undefined";
function invokeOrchestrionInstrumentation(client, moduleNames, callback, args, { requiresTracingChannelBinding = true } = {}) {
  const label = moduleNames.join(", ");
  if (!diagnosticsChannel.tracingChannel) {
    debugBuild.DEBUG_BUILD && core.debug.log(`[instrumentation:${label}] no \`tracingChannel\` (Node < 18.19), not subscribing`);
    return;
  }
  if (hasBeenInstrumented(callback)) {
    debugBuild.DEBUG_BUILD && core.debug.log(`[instrumentation:${label}] already subscribed, skipping`);
    return;
  }
  const run = (cleanup2) => {
    const subscribe = () => {
      if (hasBeenInstrumented(callback)) {
        return;
      }
      markInstrumented(callback);
      cleanup2?.();
      debugBuild.DEBUG_BUILD && core.debug.log(`[instrumentation:${label}] subscribing to channels`);
      callback(...args);
    };
    if (!requiresTracingChannelBinding) {
      subscribe();
      return;
    }
    core.waitForTracingChannelBinding(subscribe);
    if (debugBuild.DEBUG_BUILD && !hasBeenInstrumented(callback)) {
      core.debug.log(`[instrumentation:${label}] async-context binding not ready, retrying before subscribing`);
    }
  };
  if (isBun || isDeno) {
    debugBuild.DEBUG_BUILD && core.debug.log(`[instrumentation:${label}] Bun/Deno, subscribing eagerly`);
    run();
    return;
  }
  const injected = detect.getOrchestrionInjectedModules();
  const injectedName = moduleNames.find((name) => injected.includes(name));
  if (injectedName) {
    debugBuild.DEBUG_BUILD && core.debug.log(`[instrumentation:${label}] "${injectedName}" already injected, subscribing now`);
    run();
    return;
  }
  debugBuild.DEBUG_BUILD && core.debug.log(`[instrumentation:${label}] not injected yet, waiting for the module to load`);
  const cleanup = client.on("orchestrion.module-injected", (moduleName) => {
    if (hasBeenInstrumented(callback)) {
      cleanup();
      return;
    }
    if (moduleNames.includes(moduleName)) {
      debugBuild.DEBUG_BUILD && core.debug.log(`[instrumentation:${label}] "${moduleName}" injected at runtime, subscribing now`);
      run(cleanup);
    }
  });
}
function hasBeenInstrumented(callback) {
  return callback[INSTRUMENTED] ?? false;
}
function markInstrumented(callback) {
  core.addNonEnumerableProperty(callback, INSTRUMENTED, true);
}

exports.invokeOrchestrionInstrumentation = invokeOrchestrionInstrumentation;
//# sourceMappingURL=instrumentation.js.map
