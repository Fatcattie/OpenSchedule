import { consoleSandbox } from './debug-logger.js';

function maybeWarnAboutIgnoredTransactionOptions(options) {
  if (options.traceLifecycle !== "stream" || // oxlint-disable-next-line typescript/no-deprecated
  !(options.beforeSendTransaction || options.ignoreTransactions?.length)) {
    return;
  }
  consoleSandbox(() => {
    console.warn(
      "[Sentry] `beforeSendTransaction` and `ignoreTransactions` are ignored with `traceLifecycle: 'stream'` (enabled by default). Use `beforeSendSpan` and `ignoreSpans` instead, or set `traceLifecycle: 'static'`."
    );
  });
}

export { maybeWarnAboutIgnoredTransactionOptions };
//# sourceMappingURL=warnAboutIgnoredTransactionOptions.js.map
