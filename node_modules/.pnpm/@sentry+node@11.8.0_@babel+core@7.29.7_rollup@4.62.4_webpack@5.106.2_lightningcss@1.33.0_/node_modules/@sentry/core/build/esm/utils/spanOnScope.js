import { makeWeakRef, derefWeakRef } from './weakRef.js';

const SCOPE_SPAN_FIELD = "span";
function _setSpanForScope(scope, span) {
  if (span) {
    scope.refs[SCOPE_SPAN_FIELD] = makeWeakRef(span);
  } else {
    delete scope.refs[SCOPE_SPAN_FIELD];
  }
}
function _getSpanForScope(scope) {
  return derefWeakRef(scope.refs[SCOPE_SPAN_FIELD]);
}

export { _getSpanForScope, _setSpanForScope };
//# sourceMappingURL=spanOnScope.js.map
