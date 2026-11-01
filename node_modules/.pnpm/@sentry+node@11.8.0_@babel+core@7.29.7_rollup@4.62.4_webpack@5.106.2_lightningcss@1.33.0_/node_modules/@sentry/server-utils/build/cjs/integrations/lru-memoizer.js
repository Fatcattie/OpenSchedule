Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const diagnosticsChannel = require('../utils/diagnosticsChannel.js');
const core = require('@sentry/core');
const channels = require('../orchestrion/channels.js');
const tracingChannel = require('../tracing-channel.js');
const lruMemoizer = require('../orchestrion/config/lru-memoizer.js');
const instrumentation = require('../orchestrion/instrumentation.js');

const INTEGRATION_NAME = "LruMemoizer";
const _lruMemoizerIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      instrumentation.invokeOrchestrionInstrumentation(client, lruMemoizer.lruMemoizerModuleNames, instrumentLruMemoizer, []);
    }
  };
});
function instrumentLruMemoizer() {
  tracingChannel.bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel(channels.CHANNELS.LRU_MEMOIZER_LOAD),
    // We only want the helper's caller-context restore for the callback lru-memoizer fires from a detached `setImmediate`.
    () => void 0
  );
}
const lruMemoizerIntegration = core.defineIntegration(_lruMemoizerIntegration);

exports.lruMemoizerIntegration = lruMemoizerIntegration;
//# sourceMappingURL=lru-memoizer.js.map
