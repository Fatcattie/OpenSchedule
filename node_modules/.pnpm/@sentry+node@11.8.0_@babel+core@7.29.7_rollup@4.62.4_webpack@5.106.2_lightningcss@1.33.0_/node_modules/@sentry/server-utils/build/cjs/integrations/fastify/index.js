Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const instrumentation = require('./instrumentation.js');
const utils = require('./utils.js');
const errors = require('./errors.js');

const _fastifyIntegration = (({ shouldHandleError } = {}) => {
  let _shouldHandleError;
  return {
    name: utils.INTEGRATION_NAME,
    setupOnce() {
      _shouldHandleError = shouldHandleError || utils.defaultShouldHandleError;
      errors.subscribeToFastifyErrorChannel();
      instrumentation.instrumentFastify();
    },
    getShouldHandleError() {
      return _shouldHandleError;
    }
  };
});
const fastifyIntegration = core.defineIntegration(_fastifyIntegration);
function setupFastifyErrorHandler(_fastify) {
}

exports.fastifyIntegration = fastifyIntegration;
exports.setupFastifyErrorHandler = setupFastifyErrorHandler;
//# sourceMappingURL=index.js.map
