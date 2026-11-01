import { tracingChannel } from '../utils/diagnosticsChannel.js';
import { debug, waitForTracingChannelBinding, addNonEnumerableProperty } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build.js';
import { getOrchestrionInjectedModules } from './detect.js';

const INSTRUMENTED = /* @__PURE__ */ Symbol.for("SentryOrchestrionInstrumented");
const globalAny = globalThis;
const isBun = typeof globalAny.Bun !== "undefined";
const isDeno = typeof globalAny.Deno !== "undefined";
function invokeOrchestrionInstrumentation(client, moduleNames, callback, args, { requiresTracingChannelBinding = true } = {}) {
  const label = moduleNames.join(", ");
  if (!tracingChannel) {
    DEBUG_BUILD && debug.log(`[instrumentation:${label}] no \`tracingChannel\` (Node < 18.19), not subscribing`);
    return;
  }
  if (hasBeenInstrumented(callback)) {
    DEBUG_BUILD && debug.log(`[instrumentation:${label}] already subscribed, skipping`);
    return;
  }
  const run = (cleanup2) => {
    const subscribe = () => {
      if (hasBeenInstrumented(callback)) {
        return;
      }
      markInstrumented(callback);
      cleanup2?.();
      DEBUG_BUILD && debug.log(`[instrumentation:${label}] subscribing to channels`);
      callback(...args);
    };
    if (!requiresTracingChannelBinding) {
      subscribe();
      return;
    }
    waitForTracingChannelBinding(subscribe);
    if (DEBUG_BUILD && !hasBeenInstrumented(callback)) {
      debug.log(`[instrumentation:${label}] async-context binding not ready, retrying before subscribing`);
    }
  };
  if (isBun || isDeno) {
    DEBUG_BUILD && debug.log(`[instrumentation:${label}] Bun/Deno, subscribing eagerly`);
    run();
    return;
  }
  const injected = getOrchestrionInjectedModules();
  const injectedName = moduleNames.find((name) => injected.includes(name));
  if (injectedName) {
    DEBUG_BUILD && debug.log(`[instrumentation:${label}] "${injectedName}" already injected, subscribing now`);
    run();
    return;
  }
  DEBUG_BUILD && debug.log(`[instrumentation:${label}] not injected yet, waiting for the module to load`);
  const cleanup = client.on("orchestrion.module-injected", (moduleName) => {
    if (hasBeenInstrumented(callback)) {
      cleanup();
      return;
    }
    if (moduleNames.includes(moduleName)) {
      DEBUG_BUILD && debug.log(`[instrumentation:${label}] "${moduleName}" injected at runtime, subscribing now`);
      run(cleanup);
    }
  });
}
function hasBeenInstrumented(callback) {
  return callback[INSTRUMENTED] ?? false;
}
function markInstrumented(callback) {
  addNonEnumerableProperty(callback, INSTRUMENTED, true);
}

export { invokeOrchestrionInstrumentation };
//# sourceMappingURL=instrumentation.js.map
