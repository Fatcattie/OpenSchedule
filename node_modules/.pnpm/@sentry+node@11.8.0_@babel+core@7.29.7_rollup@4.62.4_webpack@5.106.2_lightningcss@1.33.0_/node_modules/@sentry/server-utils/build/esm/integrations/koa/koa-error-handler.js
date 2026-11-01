import { addNonEnumerableProperty, withActiveSpan, captureException } from '@sentry/core';

const ERROR_HANDLER_ATTACHED = "__SENTRY_KOA_ERROR_HANDLER_ATTACHED__";
const KOA_CONTEXT_SPAN = "__SENTRY_KOA_SPAN__";
function attachKoaErrorHandler(app) {
  const markedApp = app;
  if (!markedApp || typeof markedApp.on !== "function" || markedApp[ERROR_HANDLER_ATTACHED]) {
    return;
  }
  addNonEnumerableProperty(markedApp, ERROR_HANDLER_ATTACHED, true);
  markedApp.on("error", (error, context) => {
    const span = context?.[KOA_CONTEXT_SPAN];
    const capture = () => {
      captureException(error, {
        mechanism: {
          type: "auto.middleware.koa",
          handled: false
        }
      });
    };
    if (span) {
      withActiveSpan(span, capture);
    } else {
      capture();
    }
  });
}

export { KOA_CONTEXT_SPAN, attachKoaErrorHandler };
//# sourceMappingURL=koa-error-handler.js.map
