Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const diagnosticsChannel = require('../../utils/diagnosticsChannel.js');
const core = require('@sentry/core');
const graphqlDcSubscriber = require('./graphql-dc-subscriber.js');
const channels = require('../../orchestrion/channels.js');
const graphql = require('../../orchestrion/config/graphql.js');
const instrumentation = require('../../orchestrion/instrumentation.js');
const tracingChannel = require('../../tracing-channel.js');
const spans = require('./spans.js');

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
      instrumentation.invokeOrchestrionInstrumentation(client, graphql.graphqlModuleNames, instrumentGraphql, [config, getConfig]);
    },
    setupOnce() {
      setupNativeGraphQLInstrumentation(options);
    }
  };
});
function instrumentGraphql(config, getConfig) {
  tracingChannel.bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel(channels.CHANNELS.GRAPHQL_PARSE),
    () => tracingChannel.safeChannelCallback(() => spans.startParseSpan())
  );
  tracingChannel.bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel(channels.CHANNELS.GRAPHQL_VALIDATE),
    (data) => tracingChannel.safeChannelCallback(() => spans.startValidateSpan(data.arguments[1])),
    { beforeSpanEnd: (span, data) => tracingChannel.safeChannelCallback(() => spans.finalizeValidateSpan(span, data.result)) }
  );
  tracingChannel.bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel(channels.CHANNELS.GRAPHQL_EXECUTE),
    (data) => tracingChannel.safeChannelCallback(() => spans.startExecuteSpan(data.arguments, data.self, config, getConfig)),
    { beforeSpanEnd: (span, data) => tracingChannel.safeChannelCallback(() => spans.finalizeExecuteSpan(span, data.result)) }
  );
}
function setupNativeGraphQLInstrumentation(options) {
  if (!diagnosticsChannel.tracingChannel) {
    return;
  }
  core.waitForTracingChannelBinding(() => {
    graphqlDcSubscriber.subscribeGraphqlDiagnosticChannels(diagnosticsChannel.tracingChannel, options);
  });
}
const graphqlIntegration = core.defineIntegration(_graphqlIntegration);

exports.graphqlIntegration = graphqlIntegration;
//# sourceMappingURL=index.js.map
