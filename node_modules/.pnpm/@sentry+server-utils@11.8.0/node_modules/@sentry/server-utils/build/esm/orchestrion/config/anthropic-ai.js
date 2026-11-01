import { getModuleNames } from './module-names.js';

const anthropicAiConfig = [
  // One entry each for CJS/ESM
  ...["resources/messages/messages.js", "resources/messages/messages.mjs"].map((filePath) => ({
    channelName: "chat",
    module: { name: "@anthropic-ai/sdk", versionRange: ">=0.19.2 <1", filePath },
    functionQuery: { className: "Messages", methodName: "create", kind: "Sync" }
  })),
  ...["resources/completions.js", "resources/completions.mjs"].map((filePath) => ({
    channelName: "chat",
    module: { name: "@anthropic-ai/sdk", versionRange: ">=0.19.2 <1", filePath },
    functionQuery: { className: "Completions", methodName: "create", kind: "Sync" }
  })),
  ...["resources/beta/messages/messages.js", "resources/beta/messages/messages.mjs"].map((filePath) => ({
    channelName: "chat",
    module: { name: "@anthropic-ai/sdk", versionRange: ">=0.19.2 <1", filePath },
    functionQuery: { className: "Messages", methodName: "create", kind: "Sync" }
  })),
  // `messages.stream()` returns a synchronous emitter, not a promise, so `kind: 'Sync'` is required:
  // `Auto`'s promise wrapper never publishes `end` for a non-thenable return, so the span would never end.
  ...["resources/messages/messages.js", "resources/messages/messages.mjs"].map((filePath) => ({
    channelName: "messages-stream",
    module: { name: "@anthropic-ai/sdk", versionRange: ">=0.19.2 <1", filePath },
    functionQuery: { className: "Messages", methodName: "stream", kind: "Sync" }
  }))
];
const anthropicAiModuleNames = getModuleNames(anthropicAiConfig);
const anthropicAiChannels = {
  ANTHROPIC_CHAT: "orchestrion:@anthropic-ai/sdk:chat",
  ANTHROPIC_MESSAGES_STREAM: "orchestrion:@anthropic-ai/sdk:messages-stream"
};

export { anthropicAiChannels, anthropicAiConfig, anthropicAiModuleNames };
//# sourceMappingURL=anthropic-ai.js.map
