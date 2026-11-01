Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const undiciInstrumentation = require('./undici-instrumentation.js');

const _nativeNodeFetchIntegration = ((options = {}) => {
  return {
    name: "NodeFetch",
    setupOnce() {
      const clientOptions = core.getClient()?.getOptions();
      undiciInstrumentation.instrumentUndici({
        ...options,
        spans: _shouldInstrumentSpans(options, clientOptions)
      });
    }
  };
});
const nativeNodeFetchIntegration = core.defineIntegration(_nativeNodeFetchIntegration);
function _shouldInstrumentSpans(options, clientOptions = {}) {
  return options.spans ?? core.hasSpansEnabled(clientOptions);
}

exports.nativeNodeFetchIntegration = nativeNodeFetchIntegration;
//# sourceMappingURL=index.js.map
