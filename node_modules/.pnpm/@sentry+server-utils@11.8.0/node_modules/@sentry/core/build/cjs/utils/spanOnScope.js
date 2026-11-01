Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const weakRef = require('./weakRef.js');

const SCOPE_SPAN_FIELD = "span";
function _setSpanForScope(scope, span) {
  if (span) {
    scope.refs[SCOPE_SPAN_FIELD] = weakRef.makeWeakRef(span);
  } else {
    delete scope.refs[SCOPE_SPAN_FIELD];
  }
}
function _getSpanForScope(scope) {
  return weakRef.derefWeakRef(scope.refs[SCOPE_SPAN_FIELD]);
}

exports._getSpanForScope = _getSpanForScope;
exports._setSpanForScope = _setSpanForScope;
//# sourceMappingURL=spanOnScope.js.map
