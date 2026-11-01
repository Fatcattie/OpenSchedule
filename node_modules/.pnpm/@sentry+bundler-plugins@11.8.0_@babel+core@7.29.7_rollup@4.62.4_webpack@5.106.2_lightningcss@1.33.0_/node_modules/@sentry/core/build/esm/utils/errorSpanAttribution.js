import { getTraceContextFromScope } from '../currentScopes.js';
import { isPrimitive } from './is.js';
import { spanIsSampled, spanToTraceContext } from './spanUtils.js';

const escapedSpanTraceContexts = /* @__PURE__ */ new WeakMap();
function toWeakMapKey(error) {
  return isPrimitive(error) ? void 0 : error;
}
function recordEscapedErrorSpan(error, span) {
  const key = toWeakMapKey(error);
  if (!key || !spanIsSampled(span) || escapedSpanTraceContexts.has(key)) {
    return;
  }
  escapedSpanTraceContexts.set(key, spanToTraceContext(span));
}
function applyEscapedErrorSpanToEvent(event, hint, scope) {
  const key = toWeakMapKey(hint.originalException);
  const traceContext = key && escapedSpanTraceContexts.get(key);
  if (!traceContext) {
    return;
  }
  const eventTraceContext = event.contexts?.trace;
  const eventTraceId = eventTraceContext?.trace_id ?? (scope && getTraceContextFromScope(scope).trace_id);
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

export { applyEscapedErrorSpanToEvent, recordEscapedErrorSpan };
//# sourceMappingURL=errorSpanAttribution.js.map
