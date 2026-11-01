import { defineIntegration } from '@sentry/core';
import { CHANNELS } from '../orchestrion/channels.js';
import { groqModuleNames } from '../orchestrion/config/groq.js';
import { createOpenAiCompatibleIntegration } from './openai-compatible.js';

const GROQ_INTEGRATION_NAME = "Groq";
const groqIntegration = defineIntegration(
  createOpenAiCompatibleIntegration({
    integrationName: GROQ_INTEGRATION_NAME,
    providerName: "groq",
    origin: "auto.ai.groq",
    moduleNames: groqModuleNames,
    channels: { chat: CHANNELS.GROQ_CHAT, embeddings: CHANNELS.GROQ_EMBEDDINGS }
  })
);

export { GROQ_INTEGRATION_NAME, groqIntegration };
//# sourceMappingURL=groq.js.map
