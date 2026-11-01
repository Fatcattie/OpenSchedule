import { defineIntegration } from '@sentry/core';
import { instrumentFastify } from './instrumentation.js';
import { INTEGRATION_NAME, defaultShouldHandleError } from './utils.js';
import { subscribeToFastifyErrorChannel } from './errors.js';

const _fastifyIntegration = (({ shouldHandleError } = {}) => {
  let _shouldHandleError;
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      _shouldHandleError = shouldHandleError || defaultShouldHandleError;
      subscribeToFastifyErrorChannel();
      instrumentFastify();
    },
    getShouldHandleError() {
      return _shouldHandleError;
    }
  };
});
const fastifyIntegration = defineIntegration(_fastifyIntegration);
function setupFastifyErrorHandler(_fastify) {
}

export { fastifyIntegration, setupFastifyErrorHandler };
//# sourceMappingURL=index.js.map
