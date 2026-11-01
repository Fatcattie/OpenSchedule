import { tracingChannel } from '../../utils/diagnosticsChannel.js';
import { defineIntegration, waitForTracingChannelBinding } from '@sentry/core';
import { subscribeGraphqlDiagnosticChannels } from './graphql-dc-subscriber.js';
import { CHANNELS } from '../../orchestrion/channels.js';
import { graphqlModuleNames } from '../../orchestrion/config/graphql.js';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation.js';
import { bindTracingChannelToSpan, safeChannelCallback } from '../../tracing-channel.js';
import { startParseSpan, finalizeValidateSpan, startValidateSpan, finalizeExecuteSpan, startExecuteSpan } from './spans.js';

const INTEGRATION_NAME = "Graphql";
function getOptionsWithDefaults(options) {
  return {
    ignoreResolveSpans: options.ignoreResolveSpans !== false,
    ignoreTrivialResolveSpans: options.ignoreTrivialResolveSpans !== false,
    useOperationNameForRootSpan: options.useOperationNameForRootSpan !== false
  };
}
const _graphqlIntegration = ((options = {}) => {
  const config = getOptionsWithDefaults(options);
  const getConfig = () => config;
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, graphqlModuleNames, instrumentGraphql, [config, getConfig]);
    },
    setupOnce() {
      setupNativeGraphQLInstrumentation(options);
    }
  };
});
function instrumentGraphql(config, getConfig) {
  bindTracingChannelToSpan(
    tracingChannel(CHANNELS.GRAPHQL_PARSE),
    () => safeChannelCallback(() => startParseSpan())
  );
  bindTracingChannelToSpan(
    tracingChannel(CHANNELS.GRAPHQL_VALIDATE),
    (data) => safeChannelCallback(() => startValidateSpan(data.arguments[1])),
    { beforeSpanEnd: (span, data) => safeChannelCallback(() => finalizeValidateSpan(span, data.result)) }
  );
  bindTracingChannelToSpan(
    tracingChannel(CHANNELS.GRAPHQL_EXECUTE),
    (data) => safeChannelCallback(() => startExecuteSpan(data.arguments, data.self, config, getConfig)),
    { beforeSpanEnd: (span, data) => safeChannelCallback(() => finalizeExecuteSpan(span, data.result)) }
  );
}
function setupNativeGraphQLInstrumentation(options) {
  if (!tracingChannel) {
    return;
  }
  waitForTracingChannelBinding(() => {
    subscribeGraphqlDiagnosticChannels(tracingChannel, options);
  });
}
const graphqlIntegration = defineIntegration(_graphqlIntegration);

export { graphqlIntegration };
//# sourceMappingURL=index.js.map
