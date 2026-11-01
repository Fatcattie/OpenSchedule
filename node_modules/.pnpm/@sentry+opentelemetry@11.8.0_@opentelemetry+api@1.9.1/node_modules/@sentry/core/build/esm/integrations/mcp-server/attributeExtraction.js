import { MCP_REQUEST_ID, MCP_LIFECYCLE_PHASE, MCP_PROTOCOL_READY, MCP_RESOURCE_URI, MCP_RESOURCE_PROTOCOL, MCP_PROGRESS_TOKEN, MCP_PROGRESS_CURRENT, MCP_PROGRESS_TOTAL, MCP_PROGRESS_PERCENTAGE, MCP_PROGRESS_MESSAGE, MCP_LOGGING_LEVEL, MCP_LOGGING_LOGGER, MCP_LOGGING_DATA_TYPE, MCP_LOGGING_MESSAGE, MCP_CANCELLED_REQUEST_ID, MCP_CANCELLED_REASON } from '@sentry/conventions/attributes';
import { parseStringToURLObject, isURLObjectRelative } from '../../utils/url.js';
import { extractTargetInfo, getRequestArguments } from './methodConfig.js';

function formatLoggingData(data) {
  return typeof data === "string" ? data : JSON.stringify(data);
}
function getNotificationAttributes(method, params, recordInputs) {
  const attributes = {};
  switch (method) {
    case "notifications/cancelled":
      if (params?.requestId) {
        attributes[MCP_CANCELLED_REQUEST_ID] = String(params.requestId);
      }
      if (params?.reason) {
        attributes[MCP_CANCELLED_REASON] = String(params.reason);
      }
      break;
    case "notifications/message":
      if (params?.level) {
        attributes[MCP_LOGGING_LEVEL] = String(params.level);
      }
      if (params?.logger) {
        attributes[MCP_LOGGING_LOGGER] = String(params.logger);
      }
      if (params?.data !== void 0) {
        attributes[MCP_LOGGING_DATA_TYPE] = typeof params.data;
        if (recordInputs) {
          attributes[MCP_LOGGING_MESSAGE] = formatLoggingData(params.data);
        }
      }
      break;
    case "notifications/progress":
      if (params?.progressToken) {
        attributes[MCP_PROGRESS_TOKEN] = String(params.progressToken);
      }
      if (typeof params?.progress === "number") {
        attributes[MCP_PROGRESS_CURRENT] = params.progress;
      }
      if (typeof params?.total === "number") {
        attributes[MCP_PROGRESS_TOTAL] = params.total;
        if (typeof params?.progress === "number") {
          attributes[MCP_PROGRESS_PERCENTAGE] = params.progress / params.total * 100;
        }
      }
      if (params?.message) {
        attributes[MCP_PROGRESS_MESSAGE] = String(params.message);
      }
      break;
    case "notifications/resources/updated":
      if (params?.uri) {
        attributes[MCP_RESOURCE_URI] = String(params.uri);
        const urlObject = parseStringToURLObject(String(params.uri));
        if (urlObject && !isURLObjectRelative(urlObject)) {
          attributes[MCP_RESOURCE_PROTOCOL] = urlObject.protocol.replace(":", "");
        }
      }
      break;
    case "notifications/initialized":
      attributes[MCP_LIFECYCLE_PHASE] = "initialization_complete";
      attributes[MCP_PROTOCOL_READY] = 1;
      break;
  }
  return attributes;
}
function buildTypeSpecificAttributes(type, message, params, recordInputs) {
  if (type === "request") {
    const request = message;
    const targetInfo = extractTargetInfo(request.method, params || {});
    return {
      // oxlint-disable-next-line typescript/no-deprecated -- Preserve the legacy request ID attribute for existing consumers.
      ...request.id !== void 0 && { [MCP_REQUEST_ID]: String(request.id) },
      ...targetInfo.attributes,
      ...recordInputs ? getRequestArguments(request.method, params || {}) : {}
    };
  }
  return getNotificationAttributes(message.method, params || {}, recordInputs);
}

export { buildTypeSpecificAttributes, getNotificationAttributes };
//# sourceMappingURL=attributeExtraction.js.map
