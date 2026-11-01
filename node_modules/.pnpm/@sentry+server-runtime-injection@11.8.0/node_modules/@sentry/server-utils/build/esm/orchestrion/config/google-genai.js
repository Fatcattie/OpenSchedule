import { getModuleNames } from './module-names.js';

const NODE_DIST_FILES = ["dist/node/index.js", "dist/node/index.mjs", "dist/node/index.cjs"];
const googleGenAiConfig = [
  // `generateContent`/`generateContentStream` are arrow properties assigned in the constructor, not class
  // methods, so they need `expressionName` rather than `className`/`methodName`.
  ...NODE_DIST_FILES.flatMap(
    (filePath) => ["generateContent", "generateContentStream"].map((expressionName) => ({
      channelName: "generate-content",
      module: { name: "@google/genai", versionRange: ">=0.10.0 <3", filePath },
      functionQuery: { expressionName, kind: "Auto" }
    }))
  ),
  // `embedContent` is a real class method in v1 but a constructor-assigned arrow in v2; the
  // `className`/`methodName` selector matches both shapes.
  ...NODE_DIST_FILES.map((filePath) => ({
    channelName: "embed-content",
    module: { name: "@google/genai", versionRange: ">=0.10.0 <3", filePath },
    functionQuery: { className: "Models", methodName: "embedContent", kind: "Auto" }
  })),
  // `sendMessage`/`sendMessageStream` internally delegate to `Models.generateContent(Stream)`; the
  // subscriber suppresses that nested `generate-content` event so a chat call yields a single span.
  ...NODE_DIST_FILES.flatMap(
    (filePath) => ["sendMessage", "sendMessageStream"].map((methodName) => ({
      channelName: "chat",
      module: { name: "@google/genai", versionRange: ">=0.10.0 <3", filePath },
      functionQuery: { className: "Chat", methodName, kind: "Auto" }
    }))
  )
];
const googleGenAiModuleNames = getModuleNames(googleGenAiConfig);
const googleGenAiChannels = {
  GOOGLE_GENAI_GENERATE_CONTENT: "orchestrion:@google/genai:generate-content",
  GOOGLE_GENAI_EMBED_CONTENT: "orchestrion:@google/genai:embed-content",
  GOOGLE_GENAI_CHAT: "orchestrion:@google/genai:chat"
};

export { googleGenAiChannels, googleGenAiConfig, googleGenAiModuleNames };
//# sourceMappingURL=google-genai.js.map
