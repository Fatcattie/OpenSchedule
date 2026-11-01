Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const diagnosticsChannel = require('../utils/diagnosticsChannel.js');
const core = require('@sentry/core');
const server = require('@sentry/core/server');
const channels = require('../orchestrion/channels.js');
const mcpServer = require('../orchestrion/config/mcp-server.js');
const instrumentation = require('../orchestrion/instrumentation.js');
const tracingChannel = require('../tracing-channel.js');

const INTEGRATION_NAME = "McpServer";
const _mcpServerIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      instrumentation.invokeOrchestrionInstrumentation(client, mcpServer.mcpServerModuleNames, subscribe, [], {
        requiresTracingChannelBinding: false
      });
    }
  };
});
function subscribe() {
  for (const channel of [channels.CHANNELS.MCP_SERVER_V2_CONSTRUCTOR, channels.CHANNELS.MCP_SERVER_V1_CONSTRUCTOR]) {
    diagnosticsChannel.tracingChannel(channel).end.subscribe((message) => {
      tracingChannel.safeChannelCallback(() => {
        const { self } = message;
        if (self) {
          server.wrapMcpServerWithSentry(self);
        }
      });
    });
  }
}
const mcpServerIntegration = core.defineIntegration(_mcpServerIntegration);

exports.mcpServerIntegration = mcpServerIntegration;
//# sourceMappingURL=mcp-server.js.map
