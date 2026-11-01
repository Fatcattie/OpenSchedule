import { defineIntegration, getClient, hasSpansEnabled } from '@sentry/core';
import { instrumentUndici } from './undici-instrumentation.js';

const _nativeNodeFetchIntegration = ((options = {}) => {
  return {
    name: "NodeFetch",
    setupOnce() {
      const clientOptions = getClient()?.getOptions();
      instrumentUndici({
        ...options,
        spans: _shouldInstrumentSpans(options, clientOptions)
      });
    }
  };
});
const nativeNodeFetchIntegration = defineIntegration(_nativeNodeFetchIntegration);
function _shouldInstrumentSpans(options, clientOptions = {}) {
  return options.spans ?? hasSpansEnabled(clientOptions);
}

export { nativeNodeFetchIntegration };
//# sourceMappingURL=index.js.map
