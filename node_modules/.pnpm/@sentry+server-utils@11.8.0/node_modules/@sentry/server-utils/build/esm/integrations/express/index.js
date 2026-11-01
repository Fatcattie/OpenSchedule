import { tracingChannel } from '../../utils/diagnosticsChannel.js';
import { defineIntegration } from '@sentry/core';
import { expressModuleNames } from '../../orchestrion/config/express.js';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation.js';
import { instrumentExpress } from './instrumentation.js';

const INTEGRATION_NAME = "Express";
const _expressIntegration = ((options = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, expressModuleNames, instrumentExpress, [
        options,
        tracingChannel
      ]);
    }
  };
});
const expressIntegration = defineIntegration(_expressIntegration);

export { expressIntegration };
//# sourceMappingURL=index.js.map
