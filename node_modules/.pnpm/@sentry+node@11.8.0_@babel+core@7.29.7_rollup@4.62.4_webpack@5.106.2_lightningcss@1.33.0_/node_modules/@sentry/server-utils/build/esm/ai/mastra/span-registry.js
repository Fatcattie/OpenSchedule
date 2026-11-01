import { LRUMap } from '@sentry/core';
import { MAX_TRACKED_MASTRA_SPANS } from './constants.js';

const spansByMastraId = new LRUMap(MAX_TRACKED_MASTRA_SPANS);
function registerMastraSpan(mastraId, span) {
  spansByMastraId.set(mastraId, span);
}
function unregisterMastraSpan(mastraId) {
  spansByMastraId.remove(mastraId);
}
function getSentrySpanForMastraId(mastraId) {
  return spansByMastraId.get(mastraId);
}

export { getSentrySpanForMastraId, registerMastraSpan, unregisterMastraSpan };
//# sourceMappingURL=span-registry.js.map
