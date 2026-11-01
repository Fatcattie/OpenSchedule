import { DEBUG_BUILD } from '../../debug-build.js';
import { addNonEnumerableProperty } from '../../utils/object.js';
import { safeCallback } from '../../utils/safeCallback.js';

function withStaticSpan(callback) {
  addNonEnumerableProperty(callback, "_static", true);
  return callback;
}
function withStreamedSpan(callback) {
  return callback;
}
function isStaticBeforeSendSpanCallback(callback) {
  return !!callback && typeof callback === "function" && "_static" in callback && !!callback._static;
}
function applyBeforeSendSpanCallback(span, beforeSendSpan) {
  const modifiedSpan = safeCallback(
    DEBUG_BUILD ? "The `beforeSendSpan` callback threw an error, sending the span unmodified:" : "",
    () => beforeSendSpan(span),
    () => span
  );
  return modifiedSpan || span;
}

export { applyBeforeSendSpanCallback, isStaticBeforeSendSpanCallback, withStaticSpan, withStreamedSpan };
//# sourceMappingURL=beforeSendSpan.js.map
