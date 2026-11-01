import { GEN_AI_CONVERSATION_ID } from '@sentry/conventions/attributes';
import { getCurrentScope, getIsolationScope } from '../currentScopes.js';
import { defineIntegration } from '../integration.js';
import { spanToStaticSpanJSON } from '../utils/spanUtils.js';

const INTEGRATION_NAME = "ConversationId";
const _conversationIdIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      client.on("spanStart", (span) => {
        const scopeData = getCurrentScope().getScopeData();
        const isolationScopeData = getIsolationScope().getScopeData();
        const conversationId = scopeData.conversationId || isolationScopeData.conversationId;
        if (conversationId) {
          const { op, data: attributes, description: name } = spanToStaticSpanJSON(span);
          if (!op?.startsWith("gen_ai.") && !attributes["ai.operationId"] && !name?.startsWith("ai.")) {
            return;
          }
          span.setAttribute(GEN_AI_CONVERSATION_ID, conversationId);
        }
      });
    }
  };
});
const conversationIdIntegration = defineIntegration(_conversationIdIntegration);

export { conversationIdIntegration };
//# sourceMappingURL=conversationId.js.map
