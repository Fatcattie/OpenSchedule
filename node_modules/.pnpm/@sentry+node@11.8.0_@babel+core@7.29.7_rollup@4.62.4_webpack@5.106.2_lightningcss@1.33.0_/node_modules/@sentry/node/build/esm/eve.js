import { setConversationId } from '@sentry/core';
import { eveIntegration } from '@sentry/server-utils';
import { init } from './sdk/index.js';

function eveInstrumentation(options = {}) {
  const { getConversationId, ...initOptions } = options;
  const setConversationIdFromSession = (sessionId) => {
    setConversationId(getConversationId ? getConversationId({ session: { id: sessionId } }) : sessionId);
  };
  return {
    setup() {
      init({ ...initOptions, integrations: withEveIntegration(initOptions.integrations) });
    },
    events: {
      "turn.started": (event) => setConversationIdFromSession(event.sessionId),
      "step.attempt.started": (event) => setConversationIdFromSession(event.scope.sessionId)
    }
  };
}
function withEveIntegration(integrations) {
  const eve = eveIntegration();
  if (typeof integrations === "function") {
    return (defaults) => [...integrations(defaults), eve];
  }
  return [...integrations ?? [], eve];
}

export { eveInstrumentation };
//# sourceMappingURL=eve.js.map
