Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const moduleNames = require('./module-names.js');
const openaiCompatible = require('./openai-compatible.js');

const groqConfig = openaiCompatible.openAiCompatibleConfig({
  name: "groq-sdk",
  versionRange: ">=0.3.0 <2"
});
const groqModuleNames = moduleNames.getModuleNames(groqConfig);
const groqChannels = {
  GROQ_CHAT: "orchestrion:groq-sdk:chat",
  GROQ_EMBEDDINGS: "orchestrion:groq-sdk:embeddings"
};

exports.groqChannels = groqChannels;
exports.groqConfig = groqConfig;
exports.groqModuleNames = groqModuleNames;
//# sourceMappingURL=groq.js.map
