Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const moduleNames = require('./module-names.js');

const MODULE = { name: "@mistralai/mistralai", versionRange: ">=2.0.0 <3" };
const CHAT_FILE = { ...MODULE, filePath: "esm/sdk/chat.js" };
const AGENTS_FILE = { ...MODULE, filePath: "esm/sdk/agents.js" };
const mistralConfig = [
  {
    channelName: "chat",
    module: CHAT_FILE,
    functionQuery: { className: "Chat", methodName: "complete", kind: "Auto" }
  },
  {
    channelName: "chat",
    module: CHAT_FILE,
    functionQuery: { className: "Chat", methodName: "parse", kind: "Auto" }
  },
  {
    channelName: "chat-stream",
    module: CHAT_FILE,
    functionQuery: { className: "Chat", methodName: "stream", kind: "Auto" }
  },
  {
    channelName: "chat-stream",
    module: CHAT_FILE,
    functionQuery: { className: "Chat", methodName: "parseStream", kind: "Auto" }
  },
  {
    channelName: "embeddings",
    module: { ...MODULE, filePath: "esm/sdk/embeddings.js" },
    functionQuery: { className: "Embeddings", methodName: "create", kind: "Auto" }
  },
  {
    channelName: "agents",
    module: AGENTS_FILE,
    functionQuery: { className: "Agents", methodName: "complete", kind: "Auto" }
  },
  {
    channelName: "agents-stream",
    module: AGENTS_FILE,
    functionQuery: { className: "Agents", methodName: "stream", kind: "Auto" }
  }
];
const mistralModuleNames = moduleNames.getModuleNames(mistralConfig);
const mistralChannels = {
  MISTRAL_CHAT: "orchestrion:@mistralai/mistralai:chat",
  MISTRAL_CHAT_STREAM: "orchestrion:@mistralai/mistralai:chat-stream",
  MISTRAL_EMBEDDINGS: "orchestrion:@mistralai/mistralai:embeddings",
  MISTRAL_AGENTS: "orchestrion:@mistralai/mistralai:agents",
  MISTRAL_AGENTS_STREAM: "orchestrion:@mistralai/mistralai:agents-stream"
};

exports.mistralChannels = mistralChannels;
exports.mistralConfig = mistralConfig;
exports.mistralModuleNames = mistralModuleNames;
//# sourceMappingURL=mistral.js.map
