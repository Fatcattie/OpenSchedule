import { RPC_RESPONSE_STATUS_CODE, ERROR_TYPE, MCP_TOOL_RESULT_IS_ERROR, MCP_PROTOCOL_VERSION } from '@sentry/conventions/attributes';
import { SPAN_STATUS_ERROR } from '../../tracing/spanstatus.js';
import { isJsonRpcServerError } from './errorCapture.js';
import { extractToolResultAttributes, extractPromptResultAttributes } from './resultExtraction.js';
import { extractSessionDataFromInitializeResponse, extractSessionDataFromResponse, buildServerAttributesFromInfo } from './sessionExtraction.js';
import { updateSessionDataForTransport } from './sessionManagement.js';

const sessionToSpanMap = /* @__PURE__ */ new Map();
const statelessSpanMap = /* @__PURE__ */ new WeakMap();
function getOrCreateSpanMap(transport) {
  const sessionId = transport.sessionId;
  if (sessionId) {
    let spanMap2 = sessionToSpanMap.get(sessionId);
    if (!spanMap2) {
      spanMap2 = /* @__PURE__ */ new Map();
      sessionToSpanMap.set(sessionId, spanMap2);
    }
    return spanMap2;
  }
  let spanMap = statelessSpanMap.get(transport);
  if (!spanMap) {
    spanMap = /* @__PURE__ */ new Map();
    statelessSpanMap.set(transport, spanMap);
  }
  return spanMap;
}
function storeSpanForRequest(transport, requestId, span, method, capturePolicy) {
  const spanMap = getOrCreateSpanMap(transport);
  spanMap.set(requestId, {
    span,
    method,
    capturePolicy,
    // oxlint-disable-next-line sdk/no-unsafe-random-apis
    startTime: Date.now()
  });
}
function completeSpanWithResults(transport, requestId, result, error) {
  const spanMap = getOrCreateSpanMap(transport);
  const spanData = spanMap.get(requestId);
  if (spanData) {
    const { span, method } = spanData;
    const responseSessionData = method === "initialize" ? extractSessionDataFromInitializeResponse(result) : extractSessionDataFromResponse(result);
    if (method === "initialize" && (responseSessionData.protocolVersion || responseSessionData.serverInfo)) {
      updateSessionDataForTransport(transport, responseSessionData);
    }
    const responseAttributes = {
      ...buildServerAttributesFromInfo(responseSessionData.serverInfo)
    };
    if (responseSessionData.protocolVersion) {
      responseAttributes[MCP_PROTOCOL_VERSION] = responseSessionData.protocolVersion;
    }
    if (Object.keys(responseAttributes).length > 0) {
      span.setAttributes(responseAttributes);
    }
    if (error) {
      span.setAttributes({ [RPC_RESPONSE_STATUS_CODE]: String(error.code) });
      if (isJsonRpcServerError(error.code)) {
        span.setAttributes({ [ERROR_TYPE]: String(error.code) });
        span.setStatus({ code: SPAN_STATUS_ERROR, message: error.message });
      }
    } else if (method === "tools/call") {
      const toolAttributes = extractToolResultAttributes(result, spanData.capturePolicy.recordOutputs);
      span.setAttributes(toolAttributes);
      if (toolAttributes[MCP_TOOL_RESULT_IS_ERROR] === true) {
        span.setAttributes({ [ERROR_TYPE]: "tool_error" });
        span.setStatus({ code: SPAN_STATUS_ERROR, message: "internal_error" });
      }
    } else if (method === "prompts/get") {
      const promptAttributes = extractPromptResultAttributes(result, spanData.capturePolicy.recordOutputs);
      span.setAttributes(promptAttributes);
    }
    span.end();
    spanMap.delete(requestId);
  }
}
function cleanupPendingSpansForTransport(transport) {
  const sessionId = transport.sessionId;
  if (sessionId) {
    const spanMap2 = sessionToSpanMap.get(sessionId);
    if (spanMap2) {
      for (const [, spanData] of spanMap2) {
        spanData.span.setStatus({
          code: SPAN_STATUS_ERROR,
          message: "cancelled"
        });
        spanData.span.end();
      }
      sessionToSpanMap.delete(sessionId);
    }
    return;
  }
  const spanMap = statelessSpanMap.get(transport);
  if (spanMap) {
    for (const [, spanData] of spanMap) {
      spanData.span.setStatus({
        code: SPAN_STATUS_ERROR,
        message: "cancelled"
      });
      spanData.span.end();
    }
    spanMap.clear();
  }
}

export { cleanupPendingSpansForTransport, completeSpanWithResults, storeSpanForRequest };
//# sourceMappingURL=correlation.js.map
