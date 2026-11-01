Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');

function orchestrionModuleInjected(moduleName, integrationFn) {
  var _a;
  const marker = (_a = core.GLOBAL_OBJ).__SENTRY_ORCHESTRION__ ?? (_a.__SENTRY_ORCHESTRION__ = {});
  if (marker.bundler === void 0 || marker.bundler instanceof Set) {
    (marker.bundler ?? (marker.bundler = /* @__PURE__ */ new Set())).add(moduleName);
  }
  if (integrationFn) {
    (marker.integrations ?? (marker.integrations = /* @__PURE__ */ new Map())).set(moduleName, integrationFn);
  }
  core.getClient()?.emit("orchestrion.module-injected", moduleName);
}

exports.orchestrionModuleInjected = orchestrionModuleInjected;
//# sourceMappingURL=moduleInjected.js.map
