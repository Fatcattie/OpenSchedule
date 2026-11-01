Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const attributes = require('@sentry/conventions/attributes');
const utils = require('../core/utils.js');

function setMessagesAttribute(span, messages) {
  if (Array.isArray(messages) && messages.length === 0) {
    return;
  }
  const { systemInstructions, filteredMessages } = utils.extractSystemInstructions(messages);
  if (systemInstructions) {
    span.setAttributes({
      [attributes.GEN_AI_SYSTEM_INSTRUCTIONS]: systemInstructions
    });
  }
  span.setAttributes({
    [attributes.GEN_AI_INPUT_MESSAGES]: core.stringify(filteredMessages)
  });
}
const ANTHROPIC_ERROR_TYPE_TO_SPAN_STATUS = {
  invalid_request_error: "invalid_argument",
  authentication_error: "unauthenticated",
  permission_error: "permission_denied",
  not_found_error: "not_found",
  request_too_large: "failed_precondition",
  rate_limit_error: "resource_exhausted",
  api_error: "internal_error",
  overloaded_error: "unavailable"
};
function mapAnthropicErrorToStatusMessage(errorType) {
  if (!errorType) {
    return "internal_error";
  }
  return ANTHROPIC_ERROR_TYPE_TO_SPAN_STATUS[errorType] || "internal_error";
}
function handleResponseError(span, response) {
  if (response.error) {
    span.setStatus({ code: core.SPAN_STATUS_ERROR, message: mapAnthropicErrorToStatusMessage(response.error.type) });
    core.captureException(response.error, {
      mechanism: {
        handled: false,
        type: "auto.ai.anthropic.anthropic_error"
      }
    });
  }
}
function messagesFromParams(params) {
  const { system, messages, input, prompt } = params;
  const systemMessages = typeof system === "string" ? [{ role: "system", content: params.system }] : [];
  const inputParamMessages = Array.isArray(input) ? input : input != null ? [input] : void 0;
  const messagesParamMessages = Array.isArray(messages) ? messages : messages != null ? [messages] : [];
  const promptMessages = prompt != null ? [{ role: "user", content: core.stringify(prompt, String) }] : [];
  const userMessages = inputParamMessages ?? (messagesParamMessages.length ? messagesParamMessages : promptMessages);
  return [...systemMessages, ...userMessages];
}

exports.handleResponseError = handleResponseError;
exports.mapAnthropicErrorToStatusMessage = mapAnthropicErrorToStatusMessage;
exports.messagesFromParams = messagesFromParams;
exports.setMessagesAttribute = setMessagesAttribute;
//# sourceMappingURL=utils.js.map
