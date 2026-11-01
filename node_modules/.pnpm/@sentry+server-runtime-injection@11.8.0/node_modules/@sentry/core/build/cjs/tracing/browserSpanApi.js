Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const currentScopes = require('../currentScopes.js');
const spanStreaming = require('../integrations/spanStreaming.js');
const hasSpanStreamingEnabled = require('./spans/hasSpanStreamingEnabled.js');
const trace = require('./trace.js');

const clientsWithIntegration = /* @__PURE__ */ new WeakSet();
function _INTERNAL_ensureBrowserSpanStreaming(client = currentScopes.getClient()) {
  if (!client || clientsWithIntegration.has(client) || !hasSpanStreamingEnabled.hasSpanStreamingEnabled(client)) {
    return;
  }
  clientsWithIntegration.add(client);
  client.addIntegration(spanStreaming.spanStreamingIntegration());
}
function startSpan(options, callback) {
  _INTERNAL_ensureBrowserSpanStreaming();
  return trace.startSpan(options, callback);
}
function startSpanManual(options, callback) {
  _INTERNAL_ensureBrowserSpanStreaming();
  return trace.startSpanManual(options, callback);
}
function startInactiveSpan(options) {
  _INTERNAL_ensureBrowserSpanStreaming();
  return trace.startInactiveSpan(options);
}

exports._INTERNAL_ensureBrowserSpanStreaming = _INTERNAL_ensureBrowserSpanStreaming;
exports.startInactiveSpan = startInactiveSpan;
exports.startSpan = startSpan;
exports.startSpanManual = startSpanManual;
//# sourceMappingURL=browserSpanApi.js.map
