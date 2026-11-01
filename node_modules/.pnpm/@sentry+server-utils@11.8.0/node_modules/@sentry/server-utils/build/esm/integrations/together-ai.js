import { defineIntegration } from '@sentry/core';
import { CHANNELS } from '../orchestrion/channels.js';
import { togetherAiModuleNames } from '../orchestrion/config/together-ai.js';
import { createOpenAiCompatibleIntegration } from './openai-compatible.js';

const togetherAIIntegration = defineIntegration(
  createOpenAiCompatibleIntegration({
    integrationName: "TogetherAI",
    providerName: "together_ai",
    origin: "auto.ai.together_ai",
    moduleNames: togetherAiModuleNames,
    channels: { chat: CHANNELS.TOGETHER_CHAT, embeddings: CHANNELS.TOGETHER_EMBEDDINGS }
  })
);

export { togetherAIIntegration };
//# sourceMappingURL=together-ai.js.map
