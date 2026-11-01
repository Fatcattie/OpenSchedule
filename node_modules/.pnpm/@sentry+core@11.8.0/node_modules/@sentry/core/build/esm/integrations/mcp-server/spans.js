import { MCP_METHOD_NAME, SENTRY_SEGMENT_NAME_SOURCE, SENTRY_ORIGIN, SENTRY_OP } from '@sentry/conventions/attributes';
import { MCP_NOTIFICATION_SERVER_TO_CLIENT, MCP_NOTIFICATION_CLIENT_TO_SERVER, MCP_SERVER } from '@sentry/conventions/op';
import { getClient } from '../../currentScopes.js';
import { hasSpanStreamingEnabled } from '../../tracing/spans/hasSpanStreamingEnabled.js';
import { MCP_SERVER_SPAN_NAME_FALLBACK, MCP_NOTIFICATION_SPAN_NAME_FALLBACK } from '../../tracing/spans/spanNames.js';
import { startSpan } from '../../tracing/trace.js';
import { buildTypeSpecificAttributes } from './attributeExtraction.js';
import { MCP_ROUTE_SOURCE_VALUE, MCP_NOTIFICATION_ORIGIN_VALUE, MCP_FUNCTION_ORIGIN_VALUE } from './attributes.js';
import { extractTargetInfo } from './methodConfig.js';
import { filterMcpPiiFromSpanData } from './piiFiltering.js';
import { buildTransportAttributes } from './sessionExtraction.js';

function createSpanName(method, target) {
  return target ? `${method} ${target}` : method;
}
function buildSentryAttributes(type) {
  let op;
  let origin;
  switch (type) {
    case "request":
      op = MCP_SERVER;
      origin = MCP_FUNCTION_ORIGIN_VALUE;
      break;
    case "notification-incoming":
      op = MCP_NOTIFICATION_CLIENT_TO_SERVER;
      origin = MCP_NOTIFICATION_ORIGIN_VALUE;
      break;
    case "notification-outgoing":
      op = MCP_NOTIFICATION_SERVER_TO_CLIENT;
      origin = MCP_NOTIFICATION_ORIGIN_VALUE;
      break;
  }
  return {
    [SENTRY_OP]: op,
    [SENTRY_ORIGIN]: origin,
    [SENTRY_SEGMENT_NAME_SOURCE]: MCP_ROUTE_SOURCE_VALUE
  };
}
function createMcpSpan(config) {
  const { type, message, transport, extra, callback, options } = config;
  const { method } = message;
  const params = message.params;
  const client = getClient();
  const spanStreamingEnabled = !!client && hasSpanStreamingEnabled(client);
  let spanName;
  if (type === "request") {
    const targetInfo = extractTargetInfo(method, params || {});
    const target = spanStreamingEnabled && !targetInfo.targetIsLowCardinality ? void 0 : targetInfo.target;
    spanName = method ? createSpanName(method, target) : MCP_SERVER_SPAN_NAME_FALLBACK;
  } else {
    spanName = method || (spanStreamingEnabled ? MCP_NOTIFICATION_SPAN_NAME_FALLBACK : method);
  }
  const rawAttributes = {
    ...buildTransportAttributes(transport, extra, message),
    [MCP_METHOD_NAME]: method,
    ...buildTypeSpecificAttributes(type, message, params, options?.recordInputs),
    ...buildSentryAttributes(type)
  };
  const userInfo = Boolean(client?.getDataCollectionOptions().userInfo);
  const attributes = filterMcpPiiFromSpanData(rawAttributes, userInfo);
  return startSpan(
    {
      name: spanName,
      // oxlint-disable-next-line typescript/no-deprecated
      forceTransaction: true,
      attributes
    },
    callback
  );
}
function createMcpNotificationSpan(jsonRpcMessage, transport, extra, options, callback) {
  return createMcpSpan({
    type: "notification-incoming",
    message: jsonRpcMessage,
    transport,
    extra,
    callback,
    options
  });
}
function createMcpOutgoingNotificationSpan(jsonRpcMessage, transport, options, callback) {
  return createMcpSpan({
    type: "notification-outgoing",
    message: jsonRpcMessage,
    transport,
    options,
    callback
  });
}
function buildMcpServerSpanConfig(jsonRpcMessage, transport, extra, options) {
  const { method } = jsonRpcMessage;
  const params = jsonRpcMessage.params;
  const client = getClient();
  const spanStreamingEnabled = !!client && hasSpanStreamingEnabled(client);
  const targetInfo = extractTargetInfo(method, params || {});
  const target = spanStreamingEnabled && !targetInfo.targetIsLowCardinality ? void 0 : targetInfo.target;
  const spanName = method ? createSpanName(method, target) : MCP_SERVER_SPAN_NAME_FALLBACK;
  const rawAttributes = {
    ...buildTransportAttributes(transport, extra, jsonRpcMessage),
    [MCP_METHOD_NAME]: method,
    ...buildTypeSpecificAttributes("request", jsonRpcMessage, params, options?.recordInputs),
    ...buildSentryAttributes("request")
  };
  const userInfo = Boolean(client?.getDataCollectionOptions().userInfo);
  const attributes = filterMcpPiiFromSpanData(rawAttributes, userInfo);
  return {
    name: spanName,
    forceTransaction: true,
    attributes
  };
}

export { buildMcpServerSpanConfig, createMcpNotificationSpan, createMcpOutgoingNotificationSpan };
//# sourceMappingURL=spans.js.map
