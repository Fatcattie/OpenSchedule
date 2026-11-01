Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const object = require('../utils/object.js');
const weakRef = require('../utils/weakRef.js');

const SCOPE_ON_START_SPAN_FIELD = "_sentryScope";
const ISOLATION_SCOPE_ON_START_SPAN_FIELD = "_sentryIsolationScope";
const TRACER_PROVIDER_SPAN_FIELD = /* @__PURE__ */ Symbol.for("sentry.tracerProviderSpan");
function setCapturedScopesOnSpan(span, scope, isolationScope) {
  if (span) {
    object.addNonEnumerableProperty(span, ISOLATION_SCOPE_ON_START_SPAN_FIELD, weakRef.makeWeakRef(isolationScope));
    object.addNonEnumerableProperty(span, SCOPE_ON_START_SPAN_FIELD, scope);
  }
}
function getCapturedScopesOnSpan(span) {
  const spanWithScopes = span;
  return {
    scope: spanWithScopes[SCOPE_ON_START_SPAN_FIELD],
    isolationScope: weakRef.derefWeakRef(spanWithScopes[ISOLATION_SCOPE_ON_START_SPAN_FIELD])
  };
}
function markSpanAsTracerProviderSpan(span) {
  object.addNonEnumerableProperty(span, TRACER_PROVIDER_SPAN_FIELD, true);
}
function spanIsTracerProviderSpan(span) {
  return span[TRACER_PROVIDER_SPAN_FIELD] === true;
}

exports.getCapturedScopesOnSpan = getCapturedScopesOnSpan;
exports.markSpanAsTracerProviderSpan = markSpanAsTracerProviderSpan;
exports.setCapturedScopesOnSpan = setCapturedScopesOnSpan;
exports.spanIsTracerProviderSpan = spanIsTracerProviderSpan;
//# sourceMappingURL=utils.js.map
