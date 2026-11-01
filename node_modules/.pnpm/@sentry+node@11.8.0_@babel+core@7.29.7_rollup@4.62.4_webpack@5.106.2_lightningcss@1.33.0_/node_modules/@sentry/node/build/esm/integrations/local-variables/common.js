import { _INTERNAL_filterKeyValueData } from '@sentry/core';

function filterFrameVariables(vars, behavior) {
  return _INTERNAL_filterKeyValueData(vars, behavior);
}
const LOCAL_VARIABLES_KEY = "__SENTRY_ERROR_LOCAL_VARIABLES__";
function isAnonymous(name) {
  return name !== void 0 && (name.length === 0 || name === "?" || name === "<anonymous>");
}
function functionNamesMatch(a, b) {
  return a === b || `Object.${a}` === b || a === `Object.${b}` || isAnonymous(a) && isAnonymous(b);
}

export { LOCAL_VARIABLES_KEY, filterFrameVariables, functionNamesMatch, isAnonymous };
//# sourceMappingURL=common.js.map
