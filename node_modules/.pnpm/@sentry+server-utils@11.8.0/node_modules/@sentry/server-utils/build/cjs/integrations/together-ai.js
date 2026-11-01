Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const channels = require('../orchestrion/channels.js');
const togetherAi = require('../orchestrion/config/together-ai.js');
const openaiCompatible = require('./openai-compatible.js');

const togetherAIIntegration = core.defineIntegration(
  openaiCompatible.createOpenAiCompatibleIntegration({
    integrationName: "TogetherAI",
    providerName: "together_ai",
    origin: "auto.ai.together_ai",
    moduleNames: togetherAi.togetherAiModuleNames,
    channels: { chat: channels.CHANNELS.TOGETHER_CHAT, embeddings: channels.CHANNELS.TOGETHER_EMBEDDINGS }
  })
);

exports.togetherAIIntegration = togetherAIIntegration;
//# sourceMappingURL=together-ai.js.map
