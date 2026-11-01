import { getAsyncContextStrategy } from '../asyncContext/index.js';
import { getMainCarrier } from '../carrier.js';
import { getClient, withScope, getCurrentScope, getIsolationScope } from '../currentScopes.js';
import { DEBUG_BUILD } from '../debug-build.js';
import { SENTRY_OP, SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE } from '../semanticAttributes.js';
import { baggageHeaderToDynamicSamplingContext } from '../utils/baggage.js';
import { debug } from '../utils/debug-logger.js';
import { handleCallbackErrors } from '../utils/handleCallbackErrors.js';
import { recordEscapedErrorSpan } from '../utils/errorSpanAttribution.js';
import { hasSpansEnabled } from '../utils/hasSpansEnabled.js';
import { shouldIgnoreSpan } from '../utils/should-ignore-span.js';
import { hasSpanStreamingEnabled } from './spans/hasSpanStreamingEnabled.js';
import { parseSampleRate } from '../utils/parseSampleRate.js';
import { generateTraceId } from '../utils/propagationContext.js';
import { safeMathRandom } from '../utils/randomSafeContext.js';
import { _setSpanForScope } from '../utils/spanOnScope.js';
import { spanTimeInputToSeconds, addChildSpanToSpan, spanIsSampled, getActiveSpan, getRootSpan, spanToStaticSpanJSON } from '../utils/spanUtils.js';
import { shouldContinueTrace, propagationContextFromHeaders } from '../utils/tracing.js';
import { getDynamicSamplingContextFromSpan, freezeDscOnSpan } from './dynamicSamplingContext.js';
import { logSpanStart } from './logSpans.js';
import { sampleSpan } from './sampling.js';
import { spanIsNonRecordingSpan, SentryNonRecordingSpan } from './sentryNonRecordingSpan.js';
import { SentrySpan } from './sentrySpan.js';
import { SPAN_STATUS_ERROR } from './spanstatus.js';
import { setCapturedScopesOnSpan, getCapturedScopesOnSpan } from './utils.js';
import { SUPPRESS_TRACING_KEY } from './constants.js';

function startSpan(options, callback) {
  const spanArguments = parseSentrySpanArguments(options);
  const { forceTransaction, parentSpan: customParentSpan, scope: customScope } = options;
  const customForkedScope = customScope?.clone();
  return withScope(customForkedScope, () => {
    const wrapper = getActiveSpanWrapper(customParentSpan);
    return wrapper(() => {
      const scope = getCurrentScope();
      const parentSpan = getParentSpan(customScope ?? scope, customParentSpan);
      const client = getClient();
      const missingRequiredParent = options.onlyIfParent && !parentSpan;
      const activeSpan = missingRequiredParent ? startMissingRequiredParentSpan(scope, client) : createChildOrRootSpan({
        parentSpan,
        spanArguments,
        forceTransaction,
        scope
      });
      const makeSpanActive = !spanIsIgnored(activeSpan) || !parentSpan;
      return runCallback(
        activeSpan,
        makeSpanActive,
        () => callback(activeSpan),
        () => activeSpan.end()
      );
    });
  });
}
function startSpanManual(options, callback) {
  const spanArguments = parseSentrySpanArguments(options);
  const { forceTransaction, parentSpan: customParentSpan, scope: customScope } = options;
  const customForkedScope = customScope?.clone();
  return withScope(customForkedScope, () => {
    const wrapper = getActiveSpanWrapper(customParentSpan);
    return wrapper(() => {
      const scope = getCurrentScope();
      const parentSpan = getParentSpan(customScope ?? scope, customParentSpan);
      const missingRequiredParent = options.onlyIfParent && !parentSpan;
      const activeSpan = missingRequiredParent ? startMissingRequiredParentSpan(scope, getClient()) : createChildOrRootSpan({
        parentSpan,
        spanArguments,
        forceTransaction,
        scope
      });
      const makeSpanActive = !spanIsIgnored(activeSpan) || !parentSpan;
      return runCallback(activeSpan, makeSpanActive, () => callback(activeSpan, () => activeSpan.end()));
    });
  });
}
function startInactiveSpan(options) {
  const spanArguments = parseSentrySpanArguments(options);
  const { forceTransaction, parentSpan: customParentSpan, scope: customScope } = options;
  const wrapper = customScope ? (callback) => withScope(customScope, callback) : customParentSpan !== void 0 ? (callback) => withActiveSpan(customParentSpan, callback) : (callback) => callback();
  return wrapper(() => {
    const scope = getCurrentScope();
    const parentSpan = getParentSpan(customScope ?? scope, customParentSpan);
    const client = getClient();
    const missingRequiredParent = options.onlyIfParent && !parentSpan;
    if (missingRequiredParent) {
      return startMissingRequiredParentSpan(scope, client);
    }
    return createChildOrRootSpan({
      parentSpan,
      spanArguments,
      forceTransaction,
      scope
    });
  });
}
const continueTrace = (options, callback) => {
  const carrier = getMainCarrier();
  const acs = getAsyncContextStrategy(carrier);
  if (acs.continueTrace) {
    return acs.continueTrace(options, callback);
  }
  const { sentryTrace, baggage } = options;
  const client = getClient();
  const incomingDsc = baggageHeaderToDynamicSamplingContext(baggage);
  if (client && !shouldContinueTrace(client, incomingDsc?.org_id)) {
    return startNewTrace(callback);
  }
  return withScope((scope) => {
    const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);
    scope.setPropagationContext(propagationContext);
    return withActiveSpan(null, callback);
  });
};
function withActiveSpan(span, callback) {
  const acs = getAcs();
  if (acs.withActiveSpan) {
    return acs.withActiveSpan(span, callback);
  }
  return withScope((scope) => {
    _setSpanForScope(scope, span || void 0);
    return callback(scope);
  });
}
function suppressTracing(callback) {
  const acs = getAcs();
  if (acs.suppressTracing) {
    return acs.suppressTracing(callback);
  }
  return withScope((scope) => {
    scope.setSDKProcessingMetadata({ [SUPPRESS_TRACING_KEY]: true });
    return callback();
  });
}
function isTracingSuppressed(scope = getCurrentScope()) {
  const acs = getAcs();
  if (acs.isTracingSuppressed) {
    return acs.isTracingSuppressed(scope);
  }
  return scope.getScopeData().sdkProcessingMetadata[SUPPRESS_TRACING_KEY] === true;
}
function startNewTrace(callback) {
  const acs = getAcs();
  if (acs.startNewTrace) {
    return acs.startNewTrace(callback);
  }
  return withActiveSpan(null, () => {
    return withScope((scope) => {
      scope.setPropagationContext({
        traceId: generateTraceId(),
        sampleRand: safeMathRandom()
      });
      DEBUG_BUILD && debug.log(`Starting a new trace with id ${scope.getPropagationContext().traceId}`);
      return callback();
    });
  });
}
function startMissingRequiredParentSpan(scope, client) {
  client?.recordDroppedEvent("no_parent_span", "span");
  const span = new SentryNonRecordingSpan({
    dropReason: "no_parent_span",
    traceId: scope.getPropagationContext().traceId
  });
  setCapturedScopesOnSpan(span, scope, getIsolationScope());
  return span;
}
function createChildOrRootSpan({
  parentSpan: resolvedParentSpan,
  spanArguments,
  forceTransaction,
  scope: currentScope
}) {
  const isolationScope = getIsolationScope();
  const spanScope = {
    scope: currentScope,
    parentSpan: resolvedParentSpan
  };
  getClient()?.emit("prepareSpanScope", spanScope);
  const { scope, parentSpan } = spanScope;
  if (!hasSpansEnabled()) {
    const scopePropagationContext = scope.getPropagationContext();
    const traceId = parentSpan ? parentSpan.spanContext().traceId : scopePropagationContext.traceId;
    const span2 = new SentryNonRecordingSpan({ traceId });
    if (parentSpan && !forceTransaction) {
      addChildSpanToSpan(parentSpan, span2);
    }
    setCapturedScopesOnSpan(span2, scope, isolationScope);
    return span2;
  }
  const client = getClient();
  if (_shouldIgnoreStreamedSpan(client, spanArguments)) {
    if (!isTracingSuppressed(scope)) {
      client?.recordDroppedEvent("ignored", "span");
    }
    const ignoredSpan = new SentryNonRecordingSpan({
      dropReason: "ignored",
      traceId: parentSpan?.spanContext().traceId ?? scope.getPropagationContext().traceId
    });
    if (parentSpan && !forceTransaction) {
      addChildSpanToSpan(parentSpan, ignoredSpan);
    }
    setCapturedScopesOnSpan(ignoredSpan, scope, isolationScope);
    return ignoredSpan;
  }
  let span;
  if (parentSpan && !forceTransaction) {
    span = _startChildSpan(parentSpan, scope, spanArguments, isolationScope);
    addChildSpanToSpan(parentSpan, span);
  } else if (parentSpan) {
    const dsc = getDynamicSamplingContextFromSpan(parentSpan);
    const { traceId, spanId: parentSpanId } = parentSpan.spanContext();
    const parentSampled = spanIsSampled(parentSpan);
    span = _startRootSpan(
      {
        traceId,
        parentSpanId,
        ...spanArguments
      },
      scope,
      isolationScope,
      parentSampled
    );
    freezeDscOnSpan(span, dsc);
  } else {
    const { traceId, dsc, parentSpanId, sampled: parentSampled, sampleRand } = scope.getPropagationContext();
    span = _startRootSpan(
      {
        traceId,
        parentSpanId,
        ...spanArguments
      },
      scope,
      isolationScope,
      parentSampled
    );
    if (dsc) {
      const dscWithSampleRand = Object.keys(dsc).length === 0 && sampleRand !== void 0 ? { sample_rand: sampleRand.toString() } : dsc;
      freezeDscOnSpan(span, dscWithSampleRand);
    }
  }
  logSpanStart(span);
  return span;
}
function parseSentrySpanArguments(options) {
  const initialCtx = {
    // TODO(standalone): remove once the static (transaction) trace lifecycle is dropped.
    // oxlint-disable-next-line typescript/no-deprecated
    isStandalone: options.experimental?.standalone,
    ...options
  };
  if (options.op) {
    initialCtx.attributes = {
      [SENTRY_OP]: options.op,
      ...options.attributes
    };
  }
  if (options.startTime) {
    const ctx = { ...initialCtx };
    ctx.startTimestamp = spanTimeInputToSeconds(options.startTime);
    delete ctx.startTime;
    return ctx;
  }
  return initialCtx;
}
function getAcs() {
  const carrier = getMainCarrier();
  return getAsyncContextStrategy(carrier);
}
function _startRootSpan(spanArguments, scope, isolationScope, parentSampled) {
  const client = getClient();
  const options = client?.getOptions() || {};
  const { name = "" } = spanArguments;
  const mutableSpanSamplingData = { spanAttributes: { ...spanArguments.attributes }, spanName: name, parentSampled };
  client?.emit("beforeSampling", mutableSpanSamplingData, { decision: false });
  const finalParentSampled = mutableSpanSamplingData.parentSampled ?? parentSampled;
  const finalAttributes = mutableSpanSamplingData.spanAttributes;
  const currentPropagationContext = scope.getPropagationContext();
  const _isTracingSuppressed = isTracingSuppressed(scope);
  const [sampled, sampleRate, localSampleRateWasApplied, dropReason] = _isTracingSuppressed ? [false] : sampleSpan(
    options,
    {
      name,
      parentSampled: finalParentSampled,
      attributes: finalAttributes,
      normalizedRequest: isolationScope.getScopeData().sdkProcessingMetadata.normalizedRequest,
      parentSampleRate: parseSampleRate(currentPropagationContext.dsc?.sample_rate)
    },
    currentPropagationContext.sampleRand
  );
  const rootSpan = new SentrySpan({
    ...spanArguments,
    attributes: {
      [SENTRY_SEGMENT_NAME_SOURCE]: "custom",
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: sampleRate !== void 0 && localSampleRateWasApplied ? sampleRate : void 0,
      ...finalAttributes
    },
    sampled
  });
  if (!sampled && client && !_isTracingSuppressed) {
    DEBUG_BUILD && debug.log("[Tracing] Discarding root span because its trace was not chosen to be sampled.");
    const outcomeReason = dropReason || "sample_rate";
    if (!hasSpanStreamingEnabled(client) && !spanArguments.isStandalone) {
      client.recordDroppedEvent(outcomeReason, "transaction");
    }
    client.recordDroppedEvent(outcomeReason, "span");
  }
  setCapturedScopesOnSpan(rootSpan, scope, isolationScope);
  if (client) {
    client.emit("spanStart", rootSpan);
  }
  return rootSpan;
}
function _startChildSpan(parentSpan, scope, spanArguments, isolationScope) {
  const { spanId, traceId } = parentSpan.spanContext();
  const _isTracingSuppressed = isTracingSuppressed(scope);
  const sampled = _isTracingSuppressed ? false : spanIsSampled(parentSpan);
  const childSpan = sampled ? new SentrySpan({
    ...spanArguments,
    parentSpanId: spanId,
    traceId,
    sampled
  }) : new SentryNonRecordingSpan({ traceId });
  addChildSpanToSpan(parentSpan, childSpan);
  setCapturedScopesOnSpan(childSpan, scope, isolationScope);
  const client = getClient();
  if (!client) {
    return childSpan;
  }
  if (spanIsNonRecordingSpan(childSpan)) {
    if (spanIsNonRecordingSpan(parentSpan) && parentSpan.dropReason) {
      childSpan.dropReason = parentSpan.dropReason;
      client.recordDroppedEvent(parentSpan.dropReason, "span");
    } else if (!_isTracingSuppressed) {
      childSpan.dropReason = "sample_rate";
      client.recordDroppedEvent("sample_rate", "span");
    }
  }
  client.emit("spanStart", childSpan);
  return childSpan;
}
function getParentSpan(scope, customParentSpan) {
  if (customParentSpan) {
    return customParentSpan;
  }
  if (customParentSpan === null) {
    return void 0;
  }
  const span = getActiveSpan(scope);
  if (!span) {
    return void 0;
  }
  const client = getClient();
  const options = client ? client.getOptions() : {};
  if (options.parentSpanIsAlwaysRootSpan) {
    return getRootSpan(span);
  }
  return span;
}
function getActiveSpanWrapper(parentSpan) {
  return parentSpan !== void 0 ? (callback) => {
    return withActiveSpan(parentSpan, callback);
  } : (callback) => callback();
}
function _shouldIgnoreStreamedSpan(client, spanArguments) {
  const ignoreSpans = client?.getOptions().ignoreSpans;
  if (!client || !hasSpanStreamingEnabled(client) || !ignoreSpans?.length) {
    return false;
  }
  return shouldIgnoreSpan(
    {
      description: spanArguments.name || "",
      op: spanArguments.attributes?.[SENTRY_OP] || spanArguments.op,
      attributes: spanArguments.attributes
    },
    ignoreSpans
  );
}
function spanIsIgnored(span) {
  return spanIsNonRecordingSpan(span) && span.dropReason === "ignored";
}
function runCallback(span, makeSpanActive, callback, finallyCallback) {
  const wrapper = makeSpanActive ? (callback2) => {
    return withActiveSpan(span, () => {
      const scope = getCurrentScope();
      const creationScope = getCapturedScopesOnSpan(span).scope;
      if (creationScope) {
        scope.setPropagationContext(creationScope.getPropagationContext());
      }
      setCapturedScopesOnSpan(span, scope, getIsolationScope());
      return callback2();
    });
  } : (callback2) => callback2();
  return wrapper(
    () => handleCallbackErrors(
      () => callback(),
      (error) => {
        recordEscapedErrorSpan(error, span);
        const { status } = spanToStaticSpanJSON(span);
        if (span.isRecording() && status === "ok") {
          span.setStatus({ code: SPAN_STATUS_ERROR, message: "internal_error" });
        }
      },
      finallyCallback
    )
  );
}

export { continueTrace, isTracingSuppressed, spanIsIgnored, startInactiveSpan, startNewTrace, startSpan, startSpanManual, suppressTracing, withActiveSpan };
//# sourceMappingURL=trace.js.map
