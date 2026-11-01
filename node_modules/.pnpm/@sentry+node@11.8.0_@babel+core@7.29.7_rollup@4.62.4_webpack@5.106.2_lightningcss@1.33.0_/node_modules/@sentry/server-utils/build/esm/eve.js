import { defineIntegration, setConversationId } from '@sentry/core';
import { markEveGenAiRecordingDefault } from './integrations/vercel-ai/gen-ai-recording-mode.js';

function eveConversationHook(options = {}) {
  const { getConversationId } = options;
  const setConversationIdFromContext = (_event, context) => {
    const conversationId = getConversationId ? getConversationId(context) : context.session.id;
    setConversationId(conversationId);
  };
  return {
    events: {
      "turn.started": setConversationIdFromContext,
      "step.started": setConversationIdFromContext
    }
  };
}
const eveIntegration = defineIntegration(() => {
  return {
    name: "Eve",
    setup(client) {
      markEveGenAiRecordingDefault(client);
    }
  };
});

export { eveConversationHook, eveIntegration };
//# sourceMappingURL=eve.js.map
