Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');

const ERROR_HANDLER_ATTACHED = "__SENTRY_KOA_ERROR_HANDLER_ATTACHED__";
const KOA_CONTEXT_SPAN = "__SENTRY_KOA_SPAN__";
function attachKoaErrorHandler(app) {
  const markedApp = app;
  if (!markedApp || typeof markedApp.on !== "function" || markedApp[ERROR_HANDLER_ATTACHED]) {
    return;
  }
  core.addNonEnumerableProperty(markedApp, ERROR_HANDLER_ATTACHED, true);
  markedApp.on("error", (error, context) => {
    const span = context?.[KOA_CONTEXT_SPAN];
    const capture = () => {
      core.captureException(error, {
        mechanism: {
          type: "auto.middleware.koa",
          handled: false
        }
      });
    };
    if (span) {
      core.withActiveSpan(span, capture);
    } else {
      capture();
    }
  });
}

exports.KOA_CONTEXT_SPAN = KOA_CONTEXT_SPAN;
exports.attachKoaErrorHandler = attachKoaErrorHandler;
//# sourceMappingURL=koa-error-handler.js.map
