Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const debugBuild = require('../../debug-build.js');
const hapiUtils = require('./hapi-utils.js');

const ERROR_HANDLER_STATE = "__SENTRY_HAPI_ERROR_HANDLER_STATE__";
function isErrorEvent(event) {
  return !!(event && typeof event === "object" && "error" in event && event.error);
}
function attachHapiErrorHandler(server, shouldHandleError) {
  const events = server?.events;
  if (!events) {
    return;
  }
  const existingState = events[ERROR_HANDLER_STATE];
  if (existingState) {
    if (shouldHandleError) {
      existingState.shouldHandleError = shouldHandleError;
    }
    return;
  }
  const state = { shouldHandleError: shouldHandleError ?? hapiUtils.defaultShouldHandleError };
  core.addNonEnumerableProperty(events, ERROR_HANDLER_STATE, state);
  events.on({ name: "request", channels: ["error"] }, (request, event) => {
    if (core.getIsolationScope() !== core.getDefaultIsolationScope()) {
      const route = request.route;
      if (route?.path) {
        core.getIsolationScope().setTransactionName(`${route.method.toUpperCase()} ${route.path}`);
      }
    } else {
      debugBuild.DEBUG_BUILD && core.debug.warn("Isolation scope is still the default isolation scope - skipping setting transactionName");
    }
    if (isErrorEvent(event) && state.shouldHandleError(event.error, request)) {
      core.captureException(event.error, {
        mechanism: {
          type: "auto.function.hapi",
          handled: false
        }
      });
    }
  });
}

exports.attachHapiErrorHandler = attachHapiErrorHandler;
//# sourceMappingURL=hapi-error-handler.js.map
