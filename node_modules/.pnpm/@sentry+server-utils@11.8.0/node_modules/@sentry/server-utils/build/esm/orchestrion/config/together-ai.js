import { getModuleNames } from './module-names.js';
import { openAiCompatibleConfig } from './openai-compatible.js';

const togetherAiConfig = openAiCompatibleConfig({
  name: "together-ai",
  versionRange: ">=0.6.0 <1"
});
const togetherAiModuleNames = getModuleNames(togetherAiConfig);
const togetherAiChannels = {
  TOGETHER_CHAT: "orchestrion:together-ai:chat",
  TOGETHER_EMBEDDINGS: "orchestrion:together-ai:embeddings"
};

export { togetherAiChannels, togetherAiConfig, togetherAiModuleNames };
//# sourceMappingURL=together-ai.js.map
