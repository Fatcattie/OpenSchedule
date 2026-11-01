Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const diagnosticsChannel = require('../../utils/diagnosticsChannel.js');
const core = require('@sentry/core');
const express = require('../../orchestrion/config/express.js');
const instrumentation = require('../../orchestrion/instrumentation.js');
const instrumentation$1 = require('./instrumentation.js');

const INTEGRATION_NAME = "Express";
const _expressIntegration = ((options = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      instrumentation.invokeOrchestrionInstrumentation(client, express.expressModuleNames, instrumentation$1.instrumentExpress, [
        options,
        diagnosticsChannel.tracingChannel
      ]);
    }
  };
});
const expressIntegration = core.defineIntegration(_expressIntegration);

exports.expressIntegration = expressIntegration;
//# sourceMappingURL=index.js.map
