import { captureException, getIsolationScope, httpRequestToRequestData } from '@sentry/core';
import { isExpressErrorHandled } from './error-handled.js';
import { defaultShouldHandleError } from './utils.js';

function setSDKProcessingMetadata(request) {
  const sdkProcMeta = getIsolationScope()?.getScopeData()?.sdkProcessingMetadata;
  if (!sdkProcMeta?.normalizedRequest) {
    const normalizedRequest = httpRequestToRequestData(request);
    getIsolationScope().setSDKProcessingMetadata({ normalizedRequest });
  }
}
function expressErrorHandler() {
  return function sentryErrorMiddleware(error, request, res, next) {
    setSDKProcessingMetadata(request);
    if (isExpressErrorHandled(request)) {
      next(error);
      return;
    }
    if (defaultShouldHandleError(error)) {
      const eventId = captureException(error, {
        mechanism: { type: "auto.middleware.express", handled: false }
      });
      res.sentry = eventId;
    }
    next(error);
  };
}
function expressRequestHandler() {
  return function sentryRequestMiddleware(request, _res, next) {
    setSDKProcessingMetadata(request);
    next();
  };
}
function setupExpressErrorHandler(app) {
  app.use(expressRequestHandler());
  app.use(expressErrorHandler());
}

export { expressErrorHandler, setupExpressErrorHandler };
//# sourceMappingURL=error-handler.js.map
