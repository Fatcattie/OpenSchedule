import { MCP_PROMPT_NAME, MCP_RESOURCE_URI, MCP_TOOL_NAME, MCP_REQUEST_ARGUMENT_KEY_BASE, MCP_REQUEST_ARGUMENT_URI, MCP_REQUEST_ARGUMENT_NAME } from '@sentry/conventions/attributes';
import { isObjectLike } from '../../utils/is.js';

const METHOD_CONFIGS = {
  "tools/call": {
    targetField: "name",
    // oxlint-disable-next-line typescript/no-deprecated -- Preserve the legacy tool name attribute for existing consumers.
    targetAttribute: MCP_TOOL_NAME,
    targetIsLowCardinality: true,
    captureArguments: true,
    argumentsField: "arguments"
  },
  "resources/read": {
    targetField: "uri",
    targetAttribute: MCP_RESOURCE_URI,
    captureUri: true
  },
  "resources/subscribe": {
    targetField: "uri",
    targetAttribute: MCP_RESOURCE_URI
  },
  "resources/unsubscribe": {
    targetField: "uri",
    targetAttribute: MCP_RESOURCE_URI
  },
  "prompts/get": {
    targetField: "name",
    // oxlint-disable-next-line typescript/no-deprecated -- Preserve the legacy prompt name attribute for existing consumers.
    targetAttribute: MCP_PROMPT_NAME,
    targetIsLowCardinality: true,
    captureName: true,
    captureArguments: true,
    argumentsField: "arguments"
  }
};
function extractTargetInfo(method, params) {
  const config = METHOD_CONFIGS[method];
  if (!config) {
    return { targetIsLowCardinality: false, attributes: {} };
  }
  const target = config.targetField && typeof params?.[config.targetField] === "string" ? params[config.targetField] : void 0;
  return {
    target,
    targetIsLowCardinality: !!config.targetIsLowCardinality,
    attributes: target && config.targetAttribute ? { [config.targetAttribute]: target } : {}
  };
}
function getRequestArguments(method, params) {
  const args = {};
  const config = METHOD_CONFIGS[method];
  if (!config) {
    return args;
  }
  if (config.captureArguments && config.argumentsField && params?.[config.argumentsField]) {
    const argumentsObj = params[config.argumentsField];
    if (isObjectLike(argumentsObj)) {
      for (const [key, value] of Object.entries(argumentsObj)) {
        args[`${MCP_REQUEST_ARGUMENT_KEY_BASE}.${key.toLowerCase()}`] = JSON.stringify(value);
      }
    }
  }
  if (config.captureUri && params?.uri) {
    args[MCP_REQUEST_ARGUMENT_URI] = JSON.stringify(params.uri);
  }
  if (config.captureName && params?.name) {
    args[MCP_REQUEST_ARGUMENT_NAME] = JSON.stringify(params.name);
  }
  return args;
}

export { extractTargetInfo, getRequestArguments };
//# sourceMappingURL=methodConfig.js.map
