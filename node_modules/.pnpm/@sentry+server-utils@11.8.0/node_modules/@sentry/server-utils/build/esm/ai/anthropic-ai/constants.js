const ANTHROPIC_AI_INTEGRATION_NAME = "Anthropic_AI";
const ANTHROPIC_METHOD_REGISTRY = {
  "messages.create": { operation: "chat" },
  "messages.stream": { operation: "chat", streaming: true },
  "completions.create": { operation: "chat" },
  "beta.messages.create": { operation: "chat" }
};

export { ANTHROPIC_AI_INTEGRATION_NAME, ANTHROPIC_METHOD_REGISTRY };
//# sourceMappingURL=constants.js.map
