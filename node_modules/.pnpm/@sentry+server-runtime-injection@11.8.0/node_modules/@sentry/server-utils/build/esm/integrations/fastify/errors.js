import { subscribe } from '../../utils/diagnosticsChannel.js';
import { addNonEnumerableProperty, captureException, getClient } from '@sentry/core';
import { defaultShouldHandleError, INTEGRATION_NAME } from './utils.js';

const kErrorCaptured = /* @__PURE__ */ Symbol("sentry.fastifyErrorCaptured");
function getFastifyIntegration() {
  const client = getClient();
  return client?.getIntegrationByName(INTEGRATION_NAME);
}
function subscribeToFastifyErrorChannel() {
  subscribe("tracing:fastify.request.handler:error", (message) => {
    const { error, request, reply } = message;
    handleFastifyError(request, reply, error);
  });
}
function handleFastifyError(request, reply, error) {
  if (request[kErrorCaptured]) {
    return;
  }
  const shouldHandleError = getFastifyIntegration()?.getShouldHandleError() || defaultShouldHandleError;
  if (shouldHandleError(error, request, reply)) {
    addNonEnumerableProperty(request, kErrorCaptured, true);
    captureException(error, {
      mechanism: {
        handled: false,
        type: "auto.function.fastify"
      }
    });
  }
}

export { handleFastifyError, subscribeToFastifyErrorChannel };
//# sourceMappingURL=errors.js.map
