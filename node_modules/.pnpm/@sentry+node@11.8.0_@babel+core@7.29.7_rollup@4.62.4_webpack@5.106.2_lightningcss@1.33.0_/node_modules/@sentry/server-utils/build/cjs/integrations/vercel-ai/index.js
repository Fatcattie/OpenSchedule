Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const vercelAiDcSubscriber = require('./vercel-ai-dc-subscriber.js');
const diagnosticsChannel = require('../../utils/diagnosticsChannel.js');
const instrumentation = require('../../orchestrion/instrumentation.js');
const vercelAi = require('../../orchestrion/config/vercel-ai.js');
const vercelAiOrchestrionSubscriber = require('./vercel-ai-orchestrion-subscriber.js');

const _vercelAIIntegration = ((options = {}) => {
  return {
    name: "VercelAI",
    setupOnce() {
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }
      core.waitForTracingChannelBinding(() => {
        vercelAiDcSubscriber.subscribeVercelAiTracingChannel(diagnosticsChannel.tracingChannel, options);
      });
    },
    setup(client) {
      instrumentation.invokeOrchestrionInstrumentation(client, vercelAi.vercelAiModuleNames, instrumentVercelAiOrchestrion, [options]);
    }
  };
});
const vercelAIIntegration = core.defineIntegration(_vercelAIIntegration);
function instrumentVercelAiOrchestrion(options) {
  vercelAiOrchestrionSubscriber.subscribeVercelAiOrchestrionChannels(diagnosticsChannel.tracingChannel, options);
}

exports.vercelAIIntegration = vercelAIIntegration;
//# sourceMappingURL=index.js.map
