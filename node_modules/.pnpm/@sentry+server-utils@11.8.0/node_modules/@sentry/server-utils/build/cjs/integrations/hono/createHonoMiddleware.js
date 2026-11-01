Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const middlewareHandlers = require('./middlewareHandlers.js');

const SENTRY_HONO_MIDDLEWARE = "__SENTRY_HONO_MIDDLEWARE__";
const HONO_REQUEST_HANDLED = /* @__PURE__ */ Symbol.for("sentry.hono.requestHandled");
const HONO_SHOULD_HANDLE_ERROR = /* @__PURE__ */ Symbol.for("sentry.hono.shouldHandleError");
function getRequestScope(context) {
  const isolationScope = core.getIsolationScope();
  const target = isolationScope === core.getDefaultIsolationScope() ? context : isolationScope;
  return target;
}
function createHonoRequestMiddleware(options = {}) {
  const middleware = async (context, next) => {
    const scope = getRequestScope(context);
    const shouldHandleError = options.resolveShouldHandleError ? options.resolveShouldHandleError(context) : options.shouldHandleError;
    if (shouldHandleError) {
      core.addNonEnumerableProperty(scope, HONO_SHOULD_HANDLE_ERROR, shouldHandleError);
    }
    if (scope[HONO_REQUEST_HANDLED]) {
      await next();
      const dedupShouldHandleError = scope[HONO_SHOULD_HANDLE_ERROR] ?? shouldHandleError;
      middlewareHandlers.captureContextError(context, dedupShouldHandleError);
      return;
    }
    core.addNonEnumerableProperty(scope, HONO_REQUEST_HANDLED, true);
    try {
      middlewareHandlers.requestHandler(context, options.getConnInfo);
      await next();
      const effectiveShouldHandleError = scope[HONO_SHOULD_HANDLE_ERROR] ?? shouldHandleError;
      middlewareHandlers.responseHandler(context, effectiveShouldHandleError);
    } finally {
      core.addNonEnumerableProperty(scope, HONO_REQUEST_HANDLED, void 0);
      core.addNonEnumerableProperty(scope, HONO_SHOULD_HANDLE_ERROR, void 0);
    }
  };
  core.addNonEnumerableProperty(middleware, SENTRY_HONO_MIDDLEWARE, true);
  return middleware;
}

exports.SENTRY_HONO_MIDDLEWARE = SENTRY_HONO_MIDDLEWARE;
exports.createHonoRequestMiddleware = createHonoRequestMiddleware;
//# sourceMappingURL=createHonoMiddleware.js.map
