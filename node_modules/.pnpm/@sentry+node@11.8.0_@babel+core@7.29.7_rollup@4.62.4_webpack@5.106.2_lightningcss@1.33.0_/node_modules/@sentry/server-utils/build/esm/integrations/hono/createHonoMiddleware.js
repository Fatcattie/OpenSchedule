import { addNonEnumerableProperty, getIsolationScope, getDefaultIsolationScope } from '@sentry/core';
import { captureContextError, requestHandler, responseHandler } from './middlewareHandlers.js';

const SENTRY_HONO_MIDDLEWARE = "__SENTRY_HONO_MIDDLEWARE__";
const HONO_REQUEST_HANDLED = /* @__PURE__ */ Symbol.for("sentry.hono.requestHandled");
const HONO_SHOULD_HANDLE_ERROR = /* @__PURE__ */ Symbol.for("sentry.hono.shouldHandleError");
function getRequestScope(context) {
  const isolationScope = getIsolationScope();
  const target = isolationScope === getDefaultIsolationScope() ? context : isolationScope;
  return target;
}
function createHonoRequestMiddleware(options = {}) {
  const middleware = async (context, next) => {
    const scope = getRequestScope(context);
    const shouldHandleError = options.resolveShouldHandleError ? options.resolveShouldHandleError(context) : options.shouldHandleError;
    if (shouldHandleError) {
      addNonEnumerableProperty(scope, HONO_SHOULD_HANDLE_ERROR, shouldHandleError);
    }
    if (scope[HONO_REQUEST_HANDLED]) {
      await next();
      const dedupShouldHandleError = scope[HONO_SHOULD_HANDLE_ERROR] ?? shouldHandleError;
      captureContextError(context, dedupShouldHandleError);
      return;
    }
    addNonEnumerableProperty(scope, HONO_REQUEST_HANDLED, true);
    try {
      requestHandler(context, options.getConnInfo);
      await next();
      const effectiveShouldHandleError = scope[HONO_SHOULD_HANDLE_ERROR] ?? shouldHandleError;
      responseHandler(context, effectiveShouldHandleError);
    } finally {
      addNonEnumerableProperty(scope, HONO_REQUEST_HANDLED, void 0);
      addNonEnumerableProperty(scope, HONO_SHOULD_HANDLE_ERROR, void 0);
    }
  };
  addNonEnumerableProperty(middleware, SENTRY_HONO_MIDDLEWARE, true);
  return middleware;
}

export { SENTRY_HONO_MIDDLEWARE, createHonoRequestMiddleware };
//# sourceMappingURL=createHonoMiddleware.js.map
