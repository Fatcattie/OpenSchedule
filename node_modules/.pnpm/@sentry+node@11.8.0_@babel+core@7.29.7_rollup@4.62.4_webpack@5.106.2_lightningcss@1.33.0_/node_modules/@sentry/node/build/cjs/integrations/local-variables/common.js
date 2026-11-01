Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');

function filterFrameVariables(vars, behavior) {
  return core._INTERNAL_filterKeyValueData(vars, behavior);
}
const LOCAL_VARIABLES_KEY = "__SENTRY_ERROR_LOCAL_VARIABLES__";
function isAnonymous(name) {
  return name !== void 0 && (name.length === 0 || name === "?" || name === "<anonymous>");
}
function functionNamesMatch(a, b) {
  return a === b || `Object.${a}` === b || a === `Object.${b}` || isAnonymous(a) && isAnonymous(b);
}

exports.LOCAL_VARIABLES_KEY = LOCAL_VARIABLES_KEY;
exports.filterFrameVariables = filterFrameVariables;
exports.functionNamesMatch = functionNamesMatch;
exports.isAnonymous = isAnonymous;
//# sourceMappingURL=common.js.map
