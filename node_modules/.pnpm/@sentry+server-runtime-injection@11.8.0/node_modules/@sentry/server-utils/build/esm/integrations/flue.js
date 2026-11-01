import { defineIntegration, GLOBAL_OBJ, debug } from '@sentry/core';
import { createFlueInstrumentation } from '../ai/flue/index.js';
import { FLUE_INTEGRATION_NAME, FLUE_MODULE_NAME } from '../ai/flue/constants.js';
import { DEBUG_BUILD } from '../debug-build.js';

let registeredBinding;
const _flueIntegration = ((options = {}) => {
  return {
    name: FLUE_INTEGRATION_NAME,
    setup() {
      const provided = GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.providedModules?.[FLUE_MODULE_NAME];
      const instrument = provided?.instrument;
      if (typeof instrument !== "function") {
        DEBUG_BUILD && debug.log("[Flue] no provided `@flue/runtime` binding; skipping auto-registration");
        return;
      }
      if (instrument === registeredBinding) {
        DEBUG_BUILD && debug.log("[Flue] already registered in this isolate; skipping auto-registration");
        return;
      }
      try {
        instrument(createFlueInstrumentation(options));
        registeredBinding = instrument;
      } catch (error) {
        if (error?.name === "InstrumentationAlreadyInstalledError") {
          registeredBinding = instrument;
          DEBUG_BUILD && debug.log("[Flue] already instrumented by the app; skipping auto-registration");
        } else {
          debug.warn("[Flue] auto-registration failed; Flue spans will not be recorded:", error);
        }
      }
    }
  };
});
const flueIntegration = defineIntegration(_flueIntegration);

export { flueIntegration };
//# sourceMappingURL=flue.js.map
