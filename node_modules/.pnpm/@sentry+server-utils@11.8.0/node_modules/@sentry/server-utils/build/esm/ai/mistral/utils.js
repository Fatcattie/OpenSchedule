import { setOutputMessagesAttribute } from '../core/utils.js';
import { GEN_AI_REQUEST_MODEL, GEN_AI_REQUEST_TEMPERATURE, GEN_AI_REQUEST_TOP_P, GEN_AI_REQUEST_MAX_TOKENS, GEN_AI_REQUEST_FREQUENCY_PENALTY, GEN_AI_REQUEST_PRESENCE_PENALTY, GEN_AI_REQUEST_SEED, GEN_AI_RESPONSE_ID, GEN_AI_RESPONSE_MODEL, GEN_AI_USAGE_INPUT_TOKENS, GEN_AI_USAGE_OUTPUT_TOKENS, GEN_AI_USAGE_TOTAL_TOKENS, GEN_AI_RESPONSE_FINISH_REASONS, GEN_AI_RESPONSE_TEXT, GEN_AI_RESPONSE_TOOL_CALLS } from '@sentry/conventions/attributes';

function contentToString(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map(
      (part) => part && typeof part === "object" && typeof part.text === "string" ? part.text : ""
    ).join("");
  }
  return "";
}
function getSpanName(operationName, attributes) {
  const model = attributes[GEN_AI_REQUEST_MODEL];
  if (operationName === "invoke_agent" || typeof model !== "string") {
    return operationName;
  }
  return `${operationName} ${model}`;
}
function extractRequestParameters(params) {
  const attributes = {};
  if (params.model != null) attributes[GEN_AI_REQUEST_MODEL] = params.model;
  if ("temperature" in params) attributes[GEN_AI_REQUEST_TEMPERATURE] = params.temperature;
  if ("topP" in params) attributes[GEN_AI_REQUEST_TOP_P] = params.topP;
  if ("maxTokens" in params) attributes[GEN_AI_REQUEST_MAX_TOKENS] = params.maxTokens;
  if ("frequencyPenalty" in params) attributes[GEN_AI_REQUEST_FREQUENCY_PENALTY] = params.frequencyPenalty;
  if ("presencePenalty" in params) attributes[GEN_AI_REQUEST_PRESENCE_PENALTY] = params.presencePenalty;
  if ("randomSeed" in params) attributes[GEN_AI_REQUEST_SEED] = params.randomSeed;
  return attributes;
}
function addResponseAttributes(span, result, recordOutputs) {
  if (!result || typeof result !== "object") return;
  const response = result;
  const attrs = {};
  if (typeof response.id === "string") {
    attrs[GEN_AI_RESPONSE_ID] = response.id;
  }
  if (typeof response.model === "string") {
    attrs[GEN_AI_RESPONSE_MODEL] = response.model;
  }
  if (response.usage && typeof response.usage === "object") {
    const usage = response.usage;
    if (typeof usage.promptTokens === "number") attrs[GEN_AI_USAGE_INPUT_TOKENS] = usage.promptTokens;
    if (typeof usage.completionTokens === "number") attrs[GEN_AI_USAGE_OUTPUT_TOKENS] = usage.completionTokens;
    if (typeof usage.totalTokens === "number") attrs[GEN_AI_USAGE_TOTAL_TOKENS] = usage.totalTokens;
  }
  let outputMessages = [];
  if (Array.isArray(response.choices)) {
    const choices = response.choices;
    const finishReasons = choices.map((choice) => choice.finishReason).filter((reason) => typeof reason === "string");
    if (finishReasons.length > 0) {
      attrs[GEN_AI_RESPONSE_FINISH_REASONS] = JSON.stringify(finishReasons);
    }
    if (recordOutputs) {
      outputMessages = choices.map((choice) => {
        const message = choice.message;
        return {
          responseText: contentToString(message?.content),
          toolCalls: Array.isArray(message?.toolCalls) ? message.toolCalls : void 0,
          finishReason: typeof choice.finishReason === "string" ? choice.finishReason : void 0
        };
      });
      const responseTexts = outputMessages.map((message) => message.responseText).filter(Boolean);
      if (responseTexts.length > 0) {
        attrs[GEN_AI_RESPONSE_TEXT] = JSON.stringify(responseTexts);
      }
      const toolCalls = outputMessages.flatMap((message) => message.toolCalls ?? []);
      if (toolCalls.length > 0) {
        attrs[GEN_AI_RESPONSE_TOOL_CALLS] = JSON.stringify(toolCalls);
      }
    }
  }
  span.setAttributes(attrs);
  if (recordOutputs) {
    setOutputMessagesAttribute(span, outputMessages);
  }
}

export { addResponseAttributes, contentToString, extractRequestParameters, getSpanName };
//# sourceMappingURL=utils.js.map
