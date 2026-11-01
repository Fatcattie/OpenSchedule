Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const debugBuild = require('../debug-build.js');
const debugLogger = require('../utils/debug-logger.js');
const hasSpansEnabled = require('../utils/hasSpansEnabled.js');
const parseSampleRate = require('../utils/parseSampleRate.js');
const safeCallback = require('../utils/safeCallback.js');

function sampleSpan(options, samplingContext, sampleRand) {
  if (!hasSpansEnabled.hasSpansEnabled(options)) {
    return [false];
  }
  const resolved = resolveSampleRate(options, samplingContext);
  if (!resolved) {
    return [false, void 0, void 0, "callback_error"];
  }
  const [sampleRate, localSampleRateWasApplied] = resolved;
  const parsedSampleRate = parseSampleRate.parseSampleRate(sampleRate);
  if (parsedSampleRate === void 0) {
    debugBuild.DEBUG_BUILD && debugLogger.debug.warn(
      `[Tracing] Discarding root span because of invalid sample rate. Sample rate must be a boolean or a number between 0 and 1. Got ${JSON.stringify(
        sampleRate
      )} of type ${JSON.stringify(typeof sampleRate)}.`
    );
    return [false];
  }
  if (!parsedSampleRate) {
    debugBuild.DEBUG_BUILD && debugLogger.debug.log(
      `[Tracing] Discarding transaction because ${typeof options.tracesSampler === "function" ? "tracesSampler returned 0 or false" : "a negative sampling decision was inherited or tracesSampleRate is set to 0"}`
    );
    return [false, parsedSampleRate, localSampleRateWasApplied];
  }
  const shouldSample = sampleRand < parsedSampleRate;
  if (!shouldSample) {
    debugBuild.DEBUG_BUILD && debugLogger.debug.log(
      `[Tracing] Discarding transaction because it's not included in the random sample (sampling rate = ${Number(
        sampleRate
      )})`
    );
  }
  return [shouldSample, parsedSampleRate, localSampleRateWasApplied];
}
function resolveSampleRate(options, samplingContext) {
  const { tracesSampler, tracesSampleRate } = options;
  if (typeof tracesSampler === "function") {
    const samplerResult = safeCallback.safeCallback(
      debugBuild.DEBUG_BUILD ? "The `tracesSampler` callback threw an error, falling back to the parent sampling decision or `tracesSampleRate`:" : "",
      () => [
        tracesSampler({
          ...samplingContext,
          inheritOrSampleWith: (fallbackSampleRate) => {
            if (typeof samplingContext.parentSampleRate === "number") {
              return samplingContext.parentSampleRate;
            }
            if (typeof samplingContext.parentSampled === "boolean") {
              return Number(samplingContext.parentSampled);
            }
            return fallbackSampleRate;
          }
        }),
        true
      ],
      () => void 0
    );
    if (samplerResult) {
      return samplerResult;
    }
  }
  if (samplingContext.parentSampled !== void 0) {
    return [samplingContext.parentSampled];
  }
  if (typeof tracesSampleRate !== "undefined") {
    return [tracesSampleRate, true];
  }
  return void 0;
}

exports.sampleSpan = sampleSpan;
//# sourceMappingURL=sampling.js.map
