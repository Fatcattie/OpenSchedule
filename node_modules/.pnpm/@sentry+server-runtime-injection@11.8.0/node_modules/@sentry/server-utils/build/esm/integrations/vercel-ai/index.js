import { defineIntegration, waitForTracingChannelBinding } from '@sentry/core';
import { subscribeVercelAiTracingChannel } from './vercel-ai-dc-subscriber.js';
import { tracingChannel } from '../../utils/diagnosticsChannel.js';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation.js';
import { vercelAiModuleNames } from '../../orchestrion/config/vercel-ai.js';
import { subscribeVercelAiOrchestrionChannels } from './vercel-ai-orchestrion-subscriber.js';

const _vercelAIIntegration = ((options = {}) => {
  return {
    name: "VercelAI",
    setupOnce() {
      if (!tracingChannel) {
        return;
      }
      waitForTracingChannelBinding(() => {
        subscribeVercelAiTracingChannel(tracingChannel, options);
      });
    },
    setup(client) {
      invokeOrchestrionInstrumentation(client, vercelAiModuleNames, instrumentVercelAiOrchestrion, [options]);
    }
  };
});
const vercelAIIntegration = defineIntegration(_vercelAIIntegration);
function instrumentVercelAiOrchestrion(options) {
  subscribeVercelAiOrchestrionChannels(tracingChannel, options);
}

export { vercelAIIntegration };
//# sourceMappingURL=index.js.map
