import { defineIntegration } from '@sentry/core';
import { firebaseModuleNames } from '../../orchestrion/config/firebase.js';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation.js';
import { instrumentFirebase } from './instrumentation.js';

const INTEGRATION_NAME = "Firebase";
const _firebaseIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, firebaseModuleNames, instrumentFirebase, []);
    }
  };
});
const firebaseIntegration = defineIntegration(_firebaseIntegration);

export { firebaseIntegration };
//# sourceMappingURL=index.js.map
