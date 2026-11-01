import { DEBUG_BUILD } from '../debug-build.js';
import { debug } from './debug-logger.js';
import { isString, isRegExp } from './is.js';

const NOT_PROPAGATED_MESSAGE = "[Tracing] Not injecting trace data for url because it does not match tracePropagationTargets:";
const NORMALIZED_REGEXP_CACHE = /* @__PURE__ */ new WeakMap();
function normalizeRegExpTarget(pattern) {
  const flags = `${pattern.flags.replace(/[gy]/g, "")}${pattern.ignoreCase ? "" : "i"}`;
  if (flags === pattern.flags) {
    return pattern;
  }
  const cached = NORMALIZED_REGEXP_CACHE.get(pattern);
  if (cached) {
    return cached;
  }
  const normalizedPattern = new RegExp(pattern.source, flags);
  NORMALIZED_REGEXP_CACHE.set(pattern, normalizedPattern);
  return normalizedPattern;
}
function matchesTracePropagationTargets(value, tracePropagationTargets, requireExactStringMatch = false) {
  const lowerCaseValue = value.toLowerCase();
  for (const target of tracePropagationTargets) {
    if (isString(target)) {
      const lowerCaseTarget = target.toLowerCase();
      if (requireExactStringMatch ? lowerCaseValue === lowerCaseTarget : lowerCaseValue.includes(lowerCaseTarget)) {
        return true;
      }
    } else if (isRegExp(target) && normalizeRegExpTarget(target).test(value)) {
      return true;
    }
  }
  return false;
}
function shouldPropagateTraceForUrl(url, tracePropagationTargets, decisionMap) {
  if (typeof url !== "string" || !tracePropagationTargets) {
    return true;
  }
  const cachedDecision = decisionMap?.get(url);
  if (cachedDecision !== void 0) {
    DEBUG_BUILD && !cachedDecision && debug.log(NOT_PROPAGATED_MESSAGE, url);
    return cachedDecision;
  }
  const decision = matchesTracePropagationTargets(url, tracePropagationTargets);
  decisionMap?.set(url, decision);
  DEBUG_BUILD && !decision && debug.log(NOT_PROPAGATED_MESSAGE, url);
  return decision;
}

export { matchesTracePropagationTargets, shouldPropagateTraceForUrl };
//# sourceMappingURL=tracePropagationTargets.js.map
