import { MCP_TOOL_RESULT_IS_ERROR, MCP_PROMPT_RESULT_DESCRIPTION, MCP_PROMPT_RESULT_MESSAGE_COUNT, MCP_PROMPT_RESULT_MESSAGE_ROLE, MCP_PROMPT_RESULT_KEY_ROLE, MCP_PROMPT_RESULT_MESSAGE_CONTENT, MCP_PROMPT_RESULT_KEY_CONTENT, MCP_TOOL_RESULT_CONTENT_COUNT, MCP_TOOL_RESULT_CONTENT_TYPE, MCP_TOOL_RESULT_KEY_CONTENT_TYPE, MCP_TOOL_RESULT_MIME_TYPE, MCP_TOOL_RESULT_KEY_MIME_TYPE, MCP_TOOL_RESULT_URI, MCP_TOOL_RESULT_KEY_URI, MCP_TOOL_RESULT_NAME, MCP_TOOL_RESULT_KEY_NAME, MCP_TOOL_RESULT_CONTENT, MCP_TOOL_RESULT_KEY_CONTENT, MCP_TOOL_RESULT_DATA_SIZE, MCP_TOOL_RESULT_KEY_DATA_SIZE, MCP_TOOL_RESULT_RESOURCE_URI, MCP_TOOL_RESULT_KEY_RESOURCE_URI, MCP_TOOL_RESULT_RESOURCE_MIME_TYPE, MCP_TOOL_RESULT_KEY_RESOURCE_MIME_TYPE } from '@sentry/conventions/attributes';
import { isValidContentItem } from './validation.js';

function buildAllContentItemAttributes(content, includeContent) {
  const attributes = {
    [MCP_TOOL_RESULT_CONTENT_COUNT]: content.length
  };
  for (const [i, item] of content.entries()) {
    if (!isValidContentItem(item)) {
      continue;
    }
    const single = content.length === 1;
    const index = String(i);
    if (typeof item.type === "string") {
      const key = single ? MCP_TOOL_RESULT_CONTENT_TYPE : MCP_TOOL_RESULT_KEY_CONTENT_TYPE.replace("<key>", index);
      attributes[key] = item.type;
    }
    if (includeContent) {
      const safeSet = (key, value) => {
        if (typeof value === "string") {
          attributes[key] = value;
        }
      };
      safeSet(
        single ? MCP_TOOL_RESULT_MIME_TYPE : MCP_TOOL_RESULT_KEY_MIME_TYPE.replace("<key>", index),
        item.mimeType
      );
      safeSet(single ? MCP_TOOL_RESULT_URI : MCP_TOOL_RESULT_KEY_URI.replace("<key>", index), item.uri);
      safeSet(single ? MCP_TOOL_RESULT_NAME : MCP_TOOL_RESULT_KEY_NAME.replace("<key>", index), item.name);
      if (typeof item.text === "string") {
        const attrName = single ? MCP_TOOL_RESULT_CONTENT : MCP_TOOL_RESULT_KEY_CONTENT.replace("<key>", index);
        attributes[attrName] = item.text;
      }
      if (typeof item.data === "string") {
        const key = single ? MCP_TOOL_RESULT_DATA_SIZE : MCP_TOOL_RESULT_KEY_DATA_SIZE.replace("<key>", index);
        attributes[key] = item.data.length;
      }
      const resource = item.resource;
      if (isValidContentItem(resource)) {
        safeSet(
          single ? MCP_TOOL_RESULT_RESOURCE_URI : MCP_TOOL_RESULT_KEY_RESOURCE_URI.replace("<key>", index),
          resource.uri
        );
        safeSet(
          single ? MCP_TOOL_RESULT_RESOURCE_MIME_TYPE : MCP_TOOL_RESULT_KEY_RESOURCE_MIME_TYPE.replace("<key>", index),
          resource.mimeType
        );
      }
    }
  }
  return attributes;
}
function extractToolResultAttributes(result, recordOutputs) {
  if (!isValidContentItem(result)) {
    return {};
  }
  const attributes = Array.isArray(result.content) ? buildAllContentItemAttributes(result.content, recordOutputs) : {};
  if (typeof result.isError === "boolean") {
    attributes[MCP_TOOL_RESULT_IS_ERROR] = result.isError;
  }
  return attributes;
}
function extractPromptResultAttributes(result, recordOutputs) {
  const attributes = {};
  if (!isValidContentItem(result)) {
    return attributes;
  }
  if (recordOutputs && typeof result.description === "string") {
    attributes[MCP_PROMPT_RESULT_DESCRIPTION] = result.description;
  }
  if (Array.isArray(result.messages)) {
    attributes[MCP_PROMPT_RESULT_MESSAGE_COUNT] = result.messages.length;
    if (recordOutputs) {
      const messages = result.messages;
      for (const [i, message] of messages.entries()) {
        if (!isValidContentItem(message)) {
          continue;
        }
        if (typeof message.role === "string") {
          const attrName = messages.length === 1 ? MCP_PROMPT_RESULT_MESSAGE_ROLE : MCP_PROMPT_RESULT_KEY_ROLE.replace("<key>", String(i));
          attributes[attrName] = message.role;
        }
        if (isValidContentItem(message.content)) {
          const content = message.content;
          if (typeof content.text === "string") {
            const attrName = messages.length === 1 ? MCP_PROMPT_RESULT_MESSAGE_CONTENT : MCP_PROMPT_RESULT_KEY_CONTENT.replace("<key>", String(i));
            attributes[attrName] = content.text;
          }
        }
      }
    }
  }
  return attributes;
}

export { extractPromptResultAttributes, extractToolResultAttributes };
//# sourceMappingURL=resultExtraction.js.map
