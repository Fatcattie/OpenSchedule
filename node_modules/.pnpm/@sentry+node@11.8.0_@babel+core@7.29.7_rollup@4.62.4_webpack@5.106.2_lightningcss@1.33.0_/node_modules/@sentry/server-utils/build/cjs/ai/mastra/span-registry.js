Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const constants = require('./constants.js');

const spansByMastraId = new core.LRUMap(constants.MAX_TRACKED_MASTRA_SPANS);
function registerMastraSpan(mastraId, span) {
  spansByMastraId.set(mastraId, span);
}
function unregisterMastraSpan(mastraId) {
  spansByMastraId.remove(mastraId);
}
function getSentrySpanForMastraId(mastraId) {
  return spansByMastraId.get(mastraId);
}

exports.getSentrySpanForMastraId = getSentrySpanForMastraId;
exports.registerMastraSpan = registerMastraSpan;
exports.unregisterMastraSpan = unregisterMastraSpan;
//# sourceMappingURL=span-registry.js.map
