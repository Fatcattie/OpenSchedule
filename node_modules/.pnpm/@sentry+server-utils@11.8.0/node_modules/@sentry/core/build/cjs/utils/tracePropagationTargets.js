Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const debugBuild = require('../debug-build.js');
const debugLogger = require('./debug-logger.js');
const is = require('./is.js');

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
    if (is.isString(target)) {
      const lowerCaseTarget = target.toLowerCase();
      if (requireExactStringMatch ? lowerCaseValue === lowerCaseTarget : lowerCaseValue.includes(lowerCaseTarget)) {
        return true;
      }
    } else if (is.isRegExp(target) && normalizeRegExpTarget(target).test(value)) {
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
    debugBuild.DEBUG_BUILD && !cachedDecision && debugLogger.debug.log(NOT_PROPAGATED_MESSAGE, url);
    return cachedDecision;
  }
  const decision = matchesTracePropagationTargets(url, tracePropagationTargets);
  decisionMap?.set(url, decision);
  debugBuild.DEBUG_BUILD && !decision && debugLogger.debug.log(NOT_PROPAGATED_MESSAGE, url);
  return decision;
}

exports.matchesTracePropagationTargets = matchesTracePropagationTargets;
exports.shouldPropagateTraceForUrl = shouldPropagateTraceForUrl;
//# sourceMappingURL=tracePropagationTargets.js.map
