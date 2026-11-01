Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const genAiRecordingMode = require('./integrations/vercel-ai/gen-ai-recording-mode.js');

function eveConversationHook(options = {}) {
  const { getConversationId } = options;
  const setConversationIdFromContext = (_event, context) => {
    const conversationId = getConversationId ? getConversationId(context) : context.session.id;
    core.setConversationId(conversationId);
  };
  return {
    events: {
      "turn.started": setConversationIdFromContext,
      "step.started": setConversationIdFromContext
    }
  };
}
const eveIntegration = core.defineIntegration(() => {
  return {
    name: "Eve",
    setup(client) {
      genAiRecordingMode.markEveGenAiRecordingDefault(client);
    }
  };
});

exports.eveConversationHook = eveConversationHook;
exports.eveIntegration = eveIntegration;
//# sourceMappingURL=eve.js.map
