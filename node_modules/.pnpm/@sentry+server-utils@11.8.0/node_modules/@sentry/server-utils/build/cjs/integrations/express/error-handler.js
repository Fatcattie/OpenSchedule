Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const errorHandled = require('./error-handled.js');
const utils = require('./utils.js');

function setSDKProcessingMetadata(request) {
  const sdkProcMeta = core.getIsolationScope()?.getScopeData()?.sdkProcessingMetadata;
  if (!sdkProcMeta?.normalizedRequest) {
    const normalizedRequest = core.httpRequestToRequestData(request);
    core.getIsolationScope().setSDKProcessingMetadata({ normalizedRequest });
  }
}
function expressErrorHandler() {
  return function sentryErrorMiddleware(error, request, res, next) {
    setSDKProcessingMetadata(request);
    if (errorHandled.isExpressErrorHandled(request)) {
      next(error);
      return;
    }
    if (utils.defaultShouldHandleError(error)) {
      const eventId = core.captureException(error, {
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

exports.expressErrorHandler = expressErrorHandler;
exports.setupExpressErrorHandler = setupExpressErrorHandler;
//# sourceMappingURL=error-handler.js.map
