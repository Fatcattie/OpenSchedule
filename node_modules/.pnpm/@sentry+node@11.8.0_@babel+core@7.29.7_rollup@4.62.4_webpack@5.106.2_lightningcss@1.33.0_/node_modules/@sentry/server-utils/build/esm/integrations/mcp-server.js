import { tracingChannel } from '../utils/diagnosticsChannel.js';
import { defineIntegration } from '@sentry/core';
import { wrapMcpServerWithSentry } from '@sentry/core/server';
import { CHANNELS } from '../orchestrion/channels.js';
import { mcpServerModuleNames } from '../orchestrion/config/mcp-server.js';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation.js';
import { safeChannelCallback } from '../tracing-channel.js';

const INTEGRATION_NAME = "McpServer";
const _mcpServerIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, mcpServerModuleNames, subscribe, [], {
        requiresTracingChannelBinding: false
      });
    }
  };
});
function subscribe() {
  for (const channel of [CHANNELS.MCP_SERVER_V2_CONSTRUCTOR, CHANNELS.MCP_SERVER_V1_CONSTRUCTOR]) {
    tracingChannel(channel).end.subscribe((message) => {
      safeChannelCallback(() => {
        const { self } = message;
        if (self) {
          wrapMcpServerWithSentry(self);
        }
      });
    });
  }
}
const mcpServerIntegration = defineIntegration(_mcpServerIntegration);

export { mcpServerIntegration };
//# sourceMappingURL=mcp-server.js.map
