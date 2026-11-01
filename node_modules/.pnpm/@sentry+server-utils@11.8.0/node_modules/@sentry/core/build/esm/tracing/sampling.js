import { DEBUG_BUILD } from '../debug-build.js';
import { debug } from '../utils/debug-logger.js';
import { hasSpansEnabled } from '../utils/hasSpansEnabled.js';
import { parseSampleRate } from '../utils/parseSampleRate.js';
import { safeCallback } from '../utils/safeCallback.js';

function sampleSpan(options, samplingContext, sampleRand) {
  if (!hasSpansEnabled(options)) {
    return [false];
  }
  const resolved = resolveSampleRate(options, samplingContext);
  if (!resolved) {
    return [false, void 0, void 0, "callback_error"];
  }
  const [sampleRate, localSampleRateWasApplied] = resolved;
  const parsedSampleRate = parseSampleRate(sampleRate);
  if (parsedSampleRate === void 0) {
    DEBUG_BUILD && debug.warn(
      `[Tracing] Discarding root span because of invalid sample rate. Sample rate must be a boolean or a number between 0 and 1. Got ${JSON.stringify(
        sampleRate
      )} of type ${JSON.stringify(typeof sampleRate)}.`
    );
    return [false];
  }
  if (!parsedSampleRate) {
    DEBUG_BUILD && debug.log(
      `[Tracing] Discarding transaction because ${typeof options.tracesSampler === "function" ? "tracesSampler returned 0 or false" : "a negative sampling decision was inherited or tracesSampleRate is set to 0"}`
    );
    return [false, parsedSampleRate, localSampleRateWasApplied];
  }
  const shouldSample = sampleRand < parsedSampleRate;
  if (!shouldSample) {
    DEBUG_BUILD && debug.log(
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
    const samplerResult = safeCallback(
      DEBUG_BUILD ? "The `tracesSampler` callback threw an error, falling back to the parent sampling decision or `tracesSampleRate`:" : "",
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

export { sampleSpan };
//# sourceMappingURL=sampling.js.map
