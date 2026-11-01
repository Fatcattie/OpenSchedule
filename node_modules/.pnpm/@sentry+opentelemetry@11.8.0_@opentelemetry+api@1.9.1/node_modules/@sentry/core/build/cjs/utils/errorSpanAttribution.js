Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const currentScopes = require('../currentScopes.js');
const is = require('./is.js');
const spanUtils = require('./spanUtils.js');

const escapedSpanTraceContexts = /* @__PURE__ */ new WeakMap();
function toWeakMapKey(error) {
  return is.isPrimitive(error) ? void 0 : error;
}
function recordEscapedErrorSpan(error, span) {
  const key = toWeakMapKey(error);
  if (!key || !spanUtils.spanIsSampled(span) || escapedSpanTraceContexts.has(key)) {
    return;
  }
  escapedSpanTraceContexts.set(key, spanUtils.spanToTraceContext(span));
}
function applyEscapedErrorSpanToEvent(event, hint, scope) {
  const key = toWeakMapKey(hint.originalException);
  const traceContext = key && escapedSpanTraceContexts.get(key);
  if (!traceContext) {
    return;
  }
  const eventTraceContext = event.contexts?.trace;
  const eventTraceId = eventTraceContext?.trace_id ?? (scope && currentScopes.getTraceContextFromScope(scope).trace_id);
  if (eventTraceId !== traceContext.trace_id) {
    return;
  }
  event.contexts = {
    ...event.contexts,
    trace: {
      ...eventTraceContext,
      ...traceContext
    }
  };
}

exports.applyEscapedErrorSpanToEvent = applyEscapedErrorSpanToEvent;
exports.recordEscapedErrorSpan = recordEscapedErrorSpan;
//# sourceMappingURL=errorSpanAttribution.js.map
