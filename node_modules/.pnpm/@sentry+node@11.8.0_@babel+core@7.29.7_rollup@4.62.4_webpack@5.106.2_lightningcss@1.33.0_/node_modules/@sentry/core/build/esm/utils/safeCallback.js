import { DEBUG_BUILD } from '../debug-build.js';
import { debug } from './debug-logger.js';
import { isThenable } from './is.js';

const CALLBACK_ERROR = /* @__PURE__ */ Symbol.for("SentryCallbackError");
function safeCallback(message, fn, fallback) {
  let result;
  try {
    result = fn();
  } catch (error) {
    return recover(message, error, fallback);
  }
  if (isThenable(result)) {
    return result.then(void 0, (error) => recover(message, error, fallback));
  }
  return result;
}
function recover(message, error, fallback) {
  DEBUG_BUILD && debug.error(message, error);
  return fallback(error);
}

export { CALLBACK_ERROR, safeCallback };
//# sourceMappingURL=safeCallback.js.map
