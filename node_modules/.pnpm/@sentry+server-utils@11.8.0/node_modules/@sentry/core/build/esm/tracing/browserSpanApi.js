import { getClient } from '../currentScopes.js';
import { spanStreamingIntegration } from '../integrations/spanStreaming.js';
import { hasSpanStreamingEnabled } from './spans/hasSpanStreamingEnabled.js';
import { startInactiveSpan as startInactiveSpan$1, startSpan as startSpan$1, startSpanManual as startSpanManual$1 } from './trace.js';

const clientsWithIntegration = /* @__PURE__ */ new WeakSet();
function _INTERNAL_ensureBrowserSpanStreaming(client = getClient()) {
  if (!client || clientsWithIntegration.has(client) || !hasSpanStreamingEnabled(client)) {
    return;
  }
  clientsWithIntegration.add(client);
  client.addIntegration(spanStreamingIntegration());
}
function startSpan(options, callback) {
  _INTERNAL_ensureBrowserSpanStreaming();
  return startSpan$1(options, callback);
}
function startSpanManual(options, callback) {
  _INTERNAL_ensureBrowserSpanStreaming();
  return startSpanManual$1(options, callback);
}
function startInactiveSpan(options) {
  _INTERNAL_ensureBrowserSpanStreaming();
  return startInactiveSpan$1(options);
}

export { _INTERNAL_ensureBrowserSpanStreaming, startInactiveSpan, startSpan, startSpanManual };
//# sourceMappingURL=browserSpanApi.js.map
