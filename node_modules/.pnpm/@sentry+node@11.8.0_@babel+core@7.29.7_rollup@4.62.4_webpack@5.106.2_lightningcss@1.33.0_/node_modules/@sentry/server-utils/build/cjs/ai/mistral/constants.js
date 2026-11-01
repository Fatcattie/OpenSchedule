Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const MISTRAL_INTEGRATION_NAME = "Mistral";
const MISTRAL_PROVIDER_NAME = "mistralai";
const MISTRAL_ORIGIN = "auto.ai.mistralai";
const MISTRAL_METHOD_REGISTRY = {
  "chat.complete": { operation: "chat" },
  "chat.stream": { operation: "chat", streaming: true },
  "chat.parse": { operation: "chat" },
  "chat.parseStream": { operation: "chat", streaming: true },
  "embeddings.create": { operation: "embeddings" },
  "agents.complete": { operation: "invoke_agent" },
  "agents.stream": { operation: "invoke_agent", streaming: true }
};

exports.MISTRAL_INTEGRATION_NAME = MISTRAL_INTEGRATION_NAME;
exports.MISTRAL_METHOD_REGISTRY = MISTRAL_METHOD_REGISTRY;
exports.MISTRAL_ORIGIN = MISTRAL_ORIGIN;
exports.MISTRAL_PROVIDER_NAME = MISTRAL_PROVIDER_NAME;
//# sourceMappingURL=constants.js.map
