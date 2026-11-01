Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

function openAiCompatibleConfig(module) {
  return [
    ...["resources/chat/completions.js", "resources/chat/completions.mjs"].map((filePath) => ({
      channelName: "chat",
      module: { ...module, filePath },
      functionQuery: { className: "Completions", methodName: "create", kind: "Sync" }
    })),
    ...["resources/embeddings.js", "resources/embeddings.mjs"].map((filePath) => ({
      channelName: "embeddings",
      module: { ...module, filePath },
      functionQuery: { className: "Embeddings", methodName: "create", kind: "Sync" }
    }))
  ];
}

exports.openAiCompatibleConfig = openAiCompatibleConfig;
//# sourceMappingURL=openai-compatible.js.map
