Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const firebase = require('../../orchestrion/config/firebase.js');
const instrumentation = require('../../orchestrion/instrumentation.js');
const instrumentation$1 = require('./instrumentation.js');

const INTEGRATION_NAME = "Firebase";
const _firebaseIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      instrumentation.invokeOrchestrionInstrumentation(client, firebase.firebaseModuleNames, instrumentation$1.instrumentFirebase, []);
    }
  };
});
const firebaseIntegration = core.defineIntegration(_firebaseIntegration);

exports.firebaseIntegration = firebaseIntegration;
//# sourceMappingURL=index.js.map
