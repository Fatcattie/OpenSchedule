import { tracingChannel } from '../utils/diagnosticsChannel.js';
import { defineIntegration } from '@sentry/core';
import { CHANNELS } from '../orchestrion/channels.js';
import { bindTracingChannelToSpan } from '../tracing-channel.js';
import { lruMemoizerModuleNames } from '../orchestrion/config/lru-memoizer.js';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation.js';

const INTEGRATION_NAME = "LruMemoizer";
const _lruMemoizerIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, lruMemoizerModuleNames, instrumentLruMemoizer, []);
    }
  };
});
function instrumentLruMemoizer() {
  bindTracingChannelToSpan(
    tracingChannel(CHANNELS.LRU_MEMOIZER_LOAD),
    // We only want the helper's caller-context restore for the callback lru-memoizer fires from a detached `setImmediate`.
    () => void 0
  );
}
const lruMemoizerIntegration = defineIntegration(_lruMemoizerIntegration);

export { lruMemoizerIntegration };
//# sourceMappingURL=lru-memoizer.js.map
