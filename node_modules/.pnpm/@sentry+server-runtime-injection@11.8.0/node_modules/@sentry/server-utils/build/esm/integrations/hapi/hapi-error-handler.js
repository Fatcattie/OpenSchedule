import { addNonEnumerableProperty, getIsolationScope, getDefaultIsolationScope, debug, captureException } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build.js';
import { defaultShouldHandleError } from './hapi-utils.js';

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
  const state = { shouldHandleError: shouldHandleError ?? defaultShouldHandleError };
  addNonEnumerableProperty(events, ERROR_HANDLER_STATE, state);
  events.on({ name: "request", channels: ["error"] }, (request, event) => {
    if (getIsolationScope() !== getDefaultIsolationScope()) {
      const route = request.route;
      if (route?.path) {
        getIsolationScope().setTransactionName(`${route.method.toUpperCase()} ${route.path}`);
      }
    } else {
      DEBUG_BUILD && debug.warn("Isolation scope is still the default isolation scope - skipping setting transactionName");
    }
    if (isErrorEvent(event) && state.shouldHandleError(event.error, request)) {
      captureException(event.error, {
        mechanism: {
          type: "auto.function.hapi",
          handled: false
        }
      });
    }
  });
}

export { attachHapiErrorHandler };
//# sourceMappingURL=hapi-error-handler.js.map
