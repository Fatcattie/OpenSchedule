import { getModuleNames } from './module-names.js';
import { openAiCompatibleConfig } from './openai-compatible.js';

const groqConfig = openAiCompatibleConfig({
  name: "groq-sdk",
  versionRange: ">=0.3.0 <2"
});
const groqModuleNames = getModuleNames(groqConfig);
const groqChannels = {
  GROQ_CHAT: "orchestrion:groq-sdk:chat",
  GROQ_EMBEDDINGS: "orchestrion:groq-sdk:embeddings"
};

export { groqChannels, groqConfig, groqModuleNames };
//# sourceMappingURL=groq.js.map
