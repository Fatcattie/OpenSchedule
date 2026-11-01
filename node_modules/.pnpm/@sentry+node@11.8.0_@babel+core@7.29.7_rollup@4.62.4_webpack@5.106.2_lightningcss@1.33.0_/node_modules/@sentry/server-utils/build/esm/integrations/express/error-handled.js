import { addNonEnumerableProperty } from '@sentry/core';

const EXPRESS_ERROR_HANDLED = "__sentry_express_error_handled__";
function markExpressErrorHandled(request) {
  if (request && typeof request === "object") {
    addNonEnumerableProperty(request, EXPRESS_ERROR_HANDLED, true);
  }
}
function isExpressErrorHandled(request) {
  return !!(request && typeof request === "object" && request[EXPRESS_ERROR_HANDLED]);
}

export { isExpressErrorHandled, markExpressErrorHandled };
//# sourceMappingURL=error-handled.js.map
