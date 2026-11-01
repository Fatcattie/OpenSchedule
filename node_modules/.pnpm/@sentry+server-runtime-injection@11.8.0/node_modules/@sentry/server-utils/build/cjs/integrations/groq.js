Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const channels = require('../orchestrion/channels.js');
const groq = require('../orchestrion/config/groq.js');
const openaiCompatible = require('./openai-compatible.js');

const GROQ_INTEGRATION_NAME = "Groq";
const groqIntegration = core.defineIntegration(
  openaiCompatible.createOpenAiCompatibleIntegration({
    integrationName: GROQ_INTEGRATION_NAME,
    providerName: "groq",
    origin: "auto.ai.groq",
    moduleNames: groq.groqModuleNames,
    channels: { chat: channels.CHANNELS.GROQ_CHAT, embeddings: channels.CHANNELS.GROQ_EMBEDDINGS }
  })
);

exports.GROQ_INTEGRATION_NAME = GROQ_INTEGRATION_NAME;
exports.groqIntegration = groqIntegration;
//# sourceMappingURL=groq.js.map
