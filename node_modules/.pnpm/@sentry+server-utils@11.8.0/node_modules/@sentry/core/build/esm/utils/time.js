import { safeDateNow, withRandomSafeContext } from './randomSafeContext.js';
import { GLOBAL_OBJ } from './worldwide.js';

const ONE_SECOND_IN_MS = 1e3;
const CLOCK_DRIFT_THRESHOLD_MS = 1e3;
const MAX_TIME_ORIGIN_SEGMENTS = 100;
function dateTimestampInSeconds() {
  return safeDateNow() / ONE_SECOND_IN_MS;
}
let _timeOriginSegments = [];
function createUnixTimestampInSecondsFunc() {
  const { performance } = GLOBAL_OBJ;
  if (!performance?.now || !performance.timeOrigin) {
    if (performance?.now) {
      _timeOriginSegments = [{ from: 0, origin: safeDateNow() - withRandomSafeContext(() => performance.now()) }];
    }
    return dateTimestampInSeconds;
  }
  let correctedTimeOrigin = performance.timeOrigin;
  _timeOriginSegments = [{ from: 0, origin: correctedTimeOrigin }];
  let isFirstCall = true;
  let lastCheckedPerformanceNow = 0;
  return () => {
    return withRandomSafeContext(() => {
      const performanceNow = performance.now();
      const dateNow = Date.now();
      if (Math.abs(correctedTimeOrigin + performanceNow - dateNow) > CLOCK_DRIFT_THRESHOLD_MS) {
        correctedTimeOrigin = dateNow - performanceNow;
        if (isFirstCall) {
          _timeOriginSegments = [{ from: 0, origin: correctedTimeOrigin }];
        } else {
          _timeOriginSegments.push({ from: lastCheckedPerformanceNow, origin: correctedTimeOrigin });
          if (_timeOriginSegments.length > MAX_TIME_ORIGIN_SEGMENTS) {
            _timeOriginSegments.splice(1, 1);
          }
        }
      }
      isFirstCall = false;
      lastCheckedPerformanceNow = performanceNow;
      return (correctedTimeOrigin + performanceNow) / ONE_SECOND_IN_MS;
    });
  };
}
function safePerformanceNow() {
  const { performance } = GLOBAL_OBJ;
  return performance?.now ? withRandomSafeContext(() => performance.now()) : void 0;
}
let _cachedTimestampInSecondsFn;
let _checkedForDriftInThisTask = false;
function performanceTimeToSeconds(monotonicTimeInMs, entryStartTimeInMs = monotonicTimeInMs) {
  const origin = browserPerformanceTimeOrigin(entryStartTimeInMs);
  return origin == null ? void 0 : (origin + monotonicTimeInMs) / ONE_SECOND_IN_MS;
}
function timestampInSeconds() {
  const func = _cachedTimestampInSecondsFn ?? (_cachedTimestampInSecondsFn = createUnixTimestampInSecondsFunc());
  return func();
}
function browserPerformanceTimeOrigin(monotonicTimeInMs = 0) {
  if (!_checkedForDriftInThisTask) {
    _checkedForDriftInThisTask = true;
    void Promise.resolve().then(() => {
      _checkedForDriftInThisTask = false;
    });
    timestampInSeconds();
  }
  let segment;
  for (const candidate of _timeOriginSegments) {
    if (segment && candidate.from > monotonicTimeInMs) {
      break;
    }
    segment = candidate;
  }
  return segment?.origin;
}

export { browserPerformanceTimeOrigin, dateTimestampInSeconds, performanceTimeToSeconds, safePerformanceNow, timestampInSeconds };
//# sourceMappingURL=time.js.map
