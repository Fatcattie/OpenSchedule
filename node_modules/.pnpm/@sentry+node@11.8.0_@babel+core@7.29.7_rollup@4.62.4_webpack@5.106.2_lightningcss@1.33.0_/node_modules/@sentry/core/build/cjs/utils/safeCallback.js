Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const debugBuild = require('../debug-build.js');
const debugLogger = require('./debug-logger.js');
const is = require('./is.js');

const CALLBACK_ERROR = /* @__PURE__ */ Symbol.for("SentryCallbackError");
function safeCallback(message, fn, fallback) {
  let result;
  try {
    result = fn();
  } catch (error) {
    return recover(message, error, fallback);
  }
  if (is.isThenable(result)) {
    return result.then(void 0, (error) => recover(message, error, fallback));
  }
  return result;
}
function recover(message, error, fallback) {
  debugBuild.DEBUG_BUILD && debugLogger.debug.error(message, error);
  return fallback(error);
}

exports.CALLBACK_ERROR = CALLBACK_ERROR;
exports.safeCallback = safeCallback;
//# sourceMappingURL=safeCallback.js.map
