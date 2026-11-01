Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const index = require('../ai/flue/index.js');
const constants = require('../ai/flue/constants.js');
const debugBuild = require('../debug-build.js');

let registeredBinding;
const _flueIntegration = ((options = {}) => {
  return {
    name: constants.FLUE_INTEGRATION_NAME,
    setup() {
      const provided = core.GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.providedModules?.[constants.FLUE_MODULE_NAME];
      const instrument = provided?.instrument;
      if (typeof instrument !== "function") {
        debugBuild.DEBUG_BUILD && core.debug.log("[Flue] no provided `@flue/runtime` binding; skipping auto-registration");
        return;
      }
      if (instrument === registeredBinding) {
        debugBuild.DEBUG_BUILD && core.debug.log("[Flue] already registered in this isolate; skipping auto-registration");
        return;
      }
      try {
        instrument(index.createFlueInstrumentation(options));
        registeredBinding = instrument;
      } catch (error) {
        if (error?.name === "InstrumentationAlreadyInstalledError") {
          registeredBinding = instrument;
          debugBuild.DEBUG_BUILD && core.debug.log("[Flue] already instrumented by the app; skipping auto-registration");
        } else {
          core.debug.warn("[Flue] auto-registration failed; Flue spans will not be recorded:", error);
        }
      }
    }
  };
});
const flueIntegration = core.defineIntegration(_flueIntegration);

exports.flueIntegration = flueIntegration;
//# sourceMappingURL=flue.js.map
