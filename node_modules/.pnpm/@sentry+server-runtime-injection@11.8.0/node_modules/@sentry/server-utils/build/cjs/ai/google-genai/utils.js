Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const attributes = require('@sentry/conventions/attributes');

function normalizeRole(role) {
  return role === "model" ? "assistant" : role;
}
function mimeTypeOf(value) {
  return typeof value.mimeType === "string" ? value.mimeType : void 0;
}
function partToMessagePart(part) {
  if (typeof part === "string") {
    return { type: "text", content: part };
  }
  if (!core.isObjectLike(part)) {
    return void 0;
  }
  if (typeof part.text === "string") {
    return { type: part.thought === true ? "reasoning" : "text", content: part.text };
  }
  const { functionCall, functionResponse, inlineData, fileData } = part;
  if (core.isObjectLike(functionCall)) {
    return {
      type: "tool_call",
      id: functionCall.id,
      name: functionCall.name,
      arguments: core.stringify(functionCall.args ?? {}, String)
    };
  }
  if (core.isObjectLike(functionResponse)) {
    return {
      type: "tool_call_response",
      id: functionResponse.id,
      name: functionResponse.name,
      result: core.stringify(functionResponse.response ?? {}, String)
    };
  }
  if (core.isObjectLike(inlineData)) {
    return { type: "blob", mime_type: mimeTypeOf(inlineData) };
  }
  if (core.isObjectLike(fileData)) {
    return { type: "uri", mime_type: mimeTypeOf(fileData), uri: fileData.fileUri };
  }
  return { type: "object", content: part };
}
function partsToMessageParts(parts) {
  const list = Array.isArray(parts) ? parts : parts != null ? [parts] : [];
  return list.map(partToMessagePart).filter((part) => part !== void 0);
}
function isContent(value) {
  return core.isObjectLike(value) && (typeof value.role === "string" || Array.isArray(value.parts));
}
function contentToMessage(content, role) {
  return {
    role: normalizeRole(typeof content.role === "string" ? content.role : role),
    parts: partsToMessageParts(content.parts)
  };
}
function contentUnionToMessages(content, role = "user") {
  if (Array.isArray(content)) {
    const messages = [];
    let looseParts = [];
    const flushLooseParts = () => {
      if (looseParts.length) {
        messages.push({ role: normalizeRole(role), parts: looseParts });
        looseParts = [];
      }
    };
    for (const item of content) {
      if (isContent(item)) {
        flushLooseParts();
        const message = contentToMessage(item, role);
        if (message.parts.length) {
          messages.push(message);
        }
      } else {
        const part2 = partToMessagePart(item);
        if (part2) {
          looseParts.push(part2);
        }
      }
    }
    flushLooseParts();
    return messages;
  }
  if (isContent(content)) {
    const message = contentToMessage(content, role);
    return message.parts.length ? [message] : [];
  }
  const part = partToMessagePart(content);
  return part ? [{ role: normalizeRole(role), parts: [part] }] : [];
}
function candidatesToMessageParts(candidates) {
  if (!Array.isArray(candidates)) {
    return [];
  }
  return candidates.flatMap(
    (candidate) => core.isObjectLike(candidate) && core.isObjectLike(candidate.content) ? partsToMessageParts(candidate.content.parts) : []
  );
}
function mergeAdjacentTextParts(parts) {
  const merged = [];
  for (const part of parts) {
    const previous = merged[merged.length - 1];
    const mergeable = part.type === "text" || part.type === "reasoning";
    if (mergeable && previous?.type === part.type && typeof previous.content === "string") {
      previous.content += typeof part.content === "string" ? part.content : "";
    } else {
      merged.push({ ...part });
    }
  }
  return merged;
}
function setOutputMessagesAttribute(span, parts) {
  const merged = mergeAdjacentTextParts(parts);
  if (merged.length) {
    span.setAttribute(attributes.GEN_AI_OUTPUT_MESSAGES, JSON.stringify([{ role: "assistant", parts: merged }]));
  }
}
function systemInstructionToText(systemInstruction) {
  const texts = contentUnionToMessages(systemInstruction, "system").flatMap((message) => message.parts).map((part) => part.type === "text" && typeof part.content === "string" ? part.content : "").filter((text) => text.length > 0);
  return texts.length ? texts.join("\n") : void 0;
}

exports.candidatesToMessageParts = candidatesToMessageParts;
exports.contentUnionToMessages = contentUnionToMessages;
exports.partToMessagePart = partToMessagePart;
exports.setOutputMessagesAttribute = setOutputMessagesAttribute;
exports.systemInstructionToText = systemInstructionToText;
//# sourceMappingURL=utils.js.map
