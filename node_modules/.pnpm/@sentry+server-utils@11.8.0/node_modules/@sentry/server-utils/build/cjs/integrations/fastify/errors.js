Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const diagnosticsChannel = require('../../utils/diagnosticsChannel.js');
const core = require('@sentry/core');
const utils = require('./utils.js');

const kErrorCaptured = /* @__PURE__ */ Symbol("sentry.fastifyErrorCaptured");
function getFastifyIntegration() {
  const client = core.getClient();
  return client?.getIntegrationByName(utils.INTEGRATION_NAME);
}
function subscribeToFastifyErrorChannel() {
  diagnosticsChannel.subscribe("tracing:fastify.request.handler:error", (message) => {
    const { error, request, reply } = message;
    handleFastifyError(request, reply, error);
  });
}
function handleFastifyError(request, reply, error) {
  if (request[kErrorCaptured]) {
    return;
  }
  const shouldHandleError = getFastifyIntegration()?.getShouldHandleError() || utils.defaultShouldHandleError;
  if (shouldHandleError(error, request, reply)) {
    core.addNonEnumerableProperty(request, kErrorCaptured, true);
    core.captureException(error, {
      mechanism: {
        handled: false,
        type: "auto.function.fastify"
      }
    });
  }
}

exports.handleFastifyError = handleFastifyError;
exports.subscribeToFastifyErrorChannel = subscribeToFastifyErrorChannel;
//# sourceMappingURL=errors.js.map
