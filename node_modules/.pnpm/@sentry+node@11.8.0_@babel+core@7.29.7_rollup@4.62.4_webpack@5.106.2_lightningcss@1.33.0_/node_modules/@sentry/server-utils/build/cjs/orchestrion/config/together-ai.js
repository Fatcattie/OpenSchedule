Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const moduleNames = require('./module-names.js');
const openaiCompatible = require('./openai-compatible.js');

const togetherAiConfig = openaiCompatible.openAiCompatibleConfig({
  name: "together-ai",
  versionRange: ">=0.6.0 <1"
});
const togetherAiModuleNames = moduleNames.getModuleNames(togetherAiConfig);
const togetherAiChannels = {
  TOGETHER_CHAT: "orchestrion:together-ai:chat",
  TOGETHER_EMBEDDINGS: "orchestrion:together-ai:embeddings"
};

exports.togetherAiChannels = togetherAiChannels;
exports.togetherAiConfig = togetherAiConfig;
exports.togetherAiModuleNames = togetherAiModuleNames;
//# sourceMappingURL=together-ai.js.map
