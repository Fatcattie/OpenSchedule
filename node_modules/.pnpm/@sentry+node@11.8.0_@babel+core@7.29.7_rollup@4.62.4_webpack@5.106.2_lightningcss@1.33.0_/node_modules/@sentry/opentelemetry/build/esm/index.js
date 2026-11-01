import { derefWeakRef, makeWeakRef, dynamicSamplingContextToSentryBaggageHeader, consoleSandbox, isTracingSuppressed as isTracingSuppressed$1, getClient, getTraceData, propagationContextFromHeaders, baggageHeaderToDynamicSamplingContext, shouldContinueTrace, getCurrentScope, _INTERNAL_safeMathRandom, generateTraceId, getIsolationScope, markSpanAsTracerProviderSpan, getCapturedScopesOnSpan, spanIsIgnored, withScope, _INTERNAL_setSpanForScope, getActiveSpan as getActiveSpan$1, spanKindToName, startNewTrace, startInactiveSpan, SentryNonRecordingSpan, addChildSpanToSpan, setCapturedScopesOnSpan, getAsyncContextStrategy, getMainCarrier, setAsyncContextStrategy, isContinuingTrace, getDefaultIsolationScope, getDefaultCurrentScope, getDynamicSamplingContextFromSpan } from '@sentry/core';
import * as api from '@opentelemetry/api';
import { createContextKey, context, trace, TraceFlags, isSpanContextValid, ROOT_CONTEXT } from '@opentelemetry/api';
import { SENTRY_KIND } from '@sentry/conventions/attributes';
import { AsyncLocalStorage } from 'node:async_hooks';

const SENTRY_TRACE_STATE_DSC = "sentry.dsc";
const SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING = "sentry.sampled_not_recording";
const SENTRY_SCOPES_CONTEXT_KEY = createContextKey("sentry_scopes");
const SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY = createContextKey("sentry_fork_isolation_scope");
const SENTRY_FORK_SET_SCOPE_CONTEXT_KEY = createContextKey("sentry_fork_set_scope");
const SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY = createContextKey("sentry_fork_set_isolation_scope");

const SCOPE_CONTEXT_FIELD = "context";
function getScopesFromContext(context) {
  return context.getValue(SENTRY_SCOPES_CONTEXT_KEY);
}
function setScopesOnContext(context, scopes) {
  return context.setValue(SENTRY_SCOPES_CONTEXT_KEY, scopes);
}
function setContextOnScope(scope, context) {
  scope.refs[SCOPE_CONTEXT_FIELD] = makeWeakRef(context);
}
function getContextFromScope(scope) {
  return derefWeakRef(scope.refs[SCOPE_CONTEXT_FIELD]);
}

class TraceState {
  constructor() {
    this._internalState = /* @__PURE__ */ new Map();
  }
  /** @inheritDoc */
  set(key, value) {
    const next = this._clone();
    if (next._internalState.has(key)) {
      next._internalState.delete(key);
    }
    next._internalState.set(key, value);
    return next;
  }
  /** @inheritDoc */
  unset(key) {
    const next = this._clone();
    next._internalState.delete(key);
    return next;
  }
  /** @inheritDoc */
  get(key) {
    return this._internalState.get(key);
  }
  /** @inheritDoc */
  serialize() {
    return Array.from(this._internalState.keys()).reverse().map((key) => `${key}=${this._internalState.get(key)}`).join(",");
  }
  _clone() {
    const next = new TraceState();
    next._internalState = new Map(this._internalState);
    return next;
  }
}

function makeTraceState({
  dsc,
  sampled
}) {
  const dscString = dsc ? dynamicSamplingContextToSentryBaggageHeader(dsc) : void 0;
  const traceStateBase = new TraceState();
  const traceStateWithDsc = dscString ? traceStateBase.set(SENTRY_TRACE_STATE_DSC, dscString) : traceStateBase;
  return sampled === false ? traceStateWithDsc.set(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, "1") : traceStateWithDsc;
}

const SENTRY_TRACE_HEADER = "sentry-trace";
const SENTRY_BAGGAGE_HEADER = "baggage";
const W3C_TRACEPARENT_HEADER = "traceparent";
class SentryPropagator {
  /** @inheritDoc */
  inject(ctx, carrier, setter) {
    if (ctx !== context.active()) {
      consoleSandbox(() => {
        console.warn(
          "SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection."
        );
      });
      return;
    }
    if (isTracingSuppressed$1()) {
      return;
    }
    const { propagateTraceparent } = getClient()?.getOptions() ?? {};
    const { "sentry-trace": sentryTrace, baggage, traceparent } = getTraceData({ propagateTraceparent });
    if (sentryTrace) {
      setter.set(carrier, SENTRY_TRACE_HEADER, sentryTrace);
    }
    if (baggage) {
      setter.set(carrier, SENTRY_BAGGAGE_HEADER, baggage);
    }
    if (traceparent) {
      setter.set(carrier, W3C_TRACEPARENT_HEADER, traceparent);
    }
  }
  /** @inheritDoc */
  extract(ctx, carrier, getter) {
    const maybeSentryTraceHeader = getter.get(carrier, SENTRY_TRACE_HEADER);
    const baggage = getter.get(carrier, SENTRY_BAGGAGE_HEADER);
    const sentryTrace = Array.isArray(maybeSentryTraceHeader) ? maybeSentryTraceHeader[0] : maybeSentryTraceHeader;
    return getContextWithRemoteActiveSpanAndScopes(ctx, { sentryTrace, baggage });
  }
  /** @inheritDoc */
  fields() {
    return [SENTRY_TRACE_HEADER, SENTRY_BAGGAGE_HEADER, W3C_TRACEPARENT_HEADER];
  }
}
function getContextWithRemoteActiveSpan(ctx, { sentryTrace, baggage }) {
  const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);
  const { traceId, parentSpanId, sampled, dsc } = propagationContext;
  const client = getClient();
  const incomingDsc = baggageHeaderToDynamicSamplingContext(baggage);
  if (!parentSpanId || client && !shouldContinueTrace(client, incomingDsc?.org_id)) {
    return ctx;
  }
  const spanContext = generateRemoteSpanContext({
    traceId,
    spanId: parentSpanId,
    sampled,
    dsc
  });
  return trace.setSpanContext(ctx, spanContext);
}
function getContextWithRemoteActiveSpanAndScopes(ctx, options) {
  const ctxWithRemoteSpan = getContextWithRemoteActiveSpan(ctx, options);
  const isContinuingTrace = trace.getSpanContext(ctxWithRemoteSpan) !== void 0;
  return ensureScopesOnContext(ctxWithRemoteSpan, isContinuingTrace);
}
function ensureScopesOnContext(ctx, isContinuingTrace) {
  const scopes = getScopesFromContext(ctx);
  const scope = scopes ? scopes.scope : getCurrentScope().clone();
  if (!scopes && !isContinuingTrace) {
    const propagationContext = scope.getPropagationContext();
    scope.setPropagationContext({
      ...propagationContext,
      traceId: generateTraceId(),
      sampleRand: _INTERNAL_safeMathRandom()
    });
  }
  const newScopes = {
    scope,
    isolationScope: scopes ? scopes.isolationScope : getIsolationScope()
  };
  return setScopesOnContext(ctx, newScopes);
}
function generateRemoteSpanContext({
  spanId,
  traceId,
  sampled,
  dsc
}) {
  const traceState = makeTraceState({
    dsc,
    sampled
  });
  const spanContext = {
    traceId,
    spanId,
    isRemote: true,
    traceFlags: sampled ? TraceFlags.SAMPLED : TraceFlags.NONE,
    traceState
  };
  return spanContext;
}

const SUPPRESS_TRACING_KEY = createContextKey("OpenTelemetry SDK Context Key SUPPRESS_TRACING");
function isTracingSuppressed(context) {
  return context.getValue(SUPPRESS_TRACING_KEY) === true;
}

class SentryTracer {
  /** @inheritdoc */
  startSpan(name, options = {}, ctx) {
    const parentContext = ctx || context.active();
    const parentSpanCandidate = options.root ? void 0 : trace.getSpan(parentContext);
    const parentSpan = parentSpanCandidate && isSpanContextValid(parentSpanCandidate.spanContext()) ? parentSpanCandidate : void 0;
    if (isTracingSuppressed(parentContext)) {
      return this._createNonRecordingSpan(parentSpan);
    }
    const span = this._startSentrySpan(name, options, parentSpan, ctx !== void 0);
    markSpanAsTracerProviderSpan(span);
    return span;
  }
  startActiveSpan(name, optionsOrFn, contextOrFn, fn) {
    const options = typeof optionsOrFn === "function" ? {} : optionsOrFn;
    const explicitCtx = typeof contextOrFn === "function" || contextOrFn === void 0 ? void 0 : contextOrFn;
    const ctx = explicitCtx ?? context.active();
    const callback = typeof optionsOrFn === "function" ? optionsOrFn : typeof contextOrFn === "function" ? contextOrFn : fn;
    const span = this.startSpan(name, options, explicitCtx);
    const capturedIsolationScope = getCapturedScopesOnSpan(span).isolationScope;
    const withCapturedIsolationScope = (contextToFork) => capturedIsolationScope ? contextToFork.setValue(SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY, capturedIsolationScope) : contextToFork;
    if (spanIsIgnored(span) && this._hasParentSpan(options, explicitCtx)) {
      return context.with(withCapturedIsolationScope(ctx), () => callback(span));
    }
    return context.with(withCapturedIsolationScope(trace.setSpan(ctx, span)), () => {
      if (trace.getSpan(context.active()) !== span) {
        return withScope((scope) => {
          _INTERNAL_setSpanForScope(scope, span);
          return callback(span);
        });
      }
      _INTERNAL_setSpanForScope(getCurrentScope(), span);
      return callback(span);
    });
  }
  /**
   * Whether a span started with these arguments gets a parent. Mirrors the parent lookup in `startSpan`
   * plus core's fallback to the scope's active span, which is what parents the span on runtimes without an
   * OTel context manager.
   */
  _hasParentSpan(options, explicitCtx) {
    if (options.root) {
      return false;
    }
    const parentSpan = explicitCtx ? trace.getSpan(explicitCtx) : getActiveSpan$1();
    return !!parentSpan && isSpanContextValid(parentSpan.spanContext());
  }
  _startSentrySpan(name, options, parentSpan, hasExplicitContext) {
    const sentryOptions = {
      name,
      attributes: options.attributes || {},
      links: options.links,
      startTime: options.startTime
    };
    if (options.kind) {
      sentryOptions.attributes[SENTRY_KIND] = spanKindToName(options.kind);
    }
    if (options.root) {
      return startNewTrace(() => startInactiveSpan({ ...sentryOptions, parentSpan: null }));
    }
    if (parentSpan) {
      return startInactiveSpan({ ...sentryOptions, parentSpan });
    }
    return startInactiveSpan({
      ...sentryOptions,
      parentSpan: hasExplicitContext ? null : void 0
    });
  }
  _createNonRecordingSpan(parentSpan) {
    const traceId = parentSpan?.spanContext().traceId ?? getCurrentScope().getPropagationContext().traceId;
    const span = new SentryNonRecordingSpan({ traceId });
    if (parentSpan) {
      addChildSpanToSpan(parentSpan, span);
    }
    setCapturedScopesOnSpan(span, getCurrentScope(), getIsolationScope());
    return span;
  }
}

class SentryTracerProvider {
  constructor() {
    this._tracers = /* @__PURE__ */ new Map();
  }
  /** @inheritdoc */
  getTracer(name, version, options) {
    const key = JSON.stringify([name, version, options]);
    const cachedTracer = this._tracers.get(key);
    if (cachedTracer) {
      return cachedTracer;
    }
    const tracer = new SentryTracer();
    this._tracers.set(key, tracer);
    return tracer;
  }
  /** Compatibility with SDK tracer providers. */
  forceFlush() {
    return Promise.resolve();
  }
  /** Compatibility with SDK tracer providers. */
  shutdown() {
    return Promise.resolve();
  }
}

function withActiveSpan(span, callback) {
  const newContextWithActiveSpan = span ? trace.setSpan(context.active(), span) : trace.deleteSpan(context.active());
  return context.with(newContextWithActiveSpan, () => {
    const scope = getCurrentScope();
    _INTERNAL_setSpanForScope(scope, span ?? void 0);
    return callback(scope);
  });
}

function getActiveSpan(scope) {
  const span = scope ? getSpanFromScope(scope) : trace.getActiveSpan();
  return span && isSpanContextValid(span.spanContext()) ? span : void 0;
}
function getSpanFromScope(scope) {
  const ctx = getContextFromScope(scope);
  return ctx ? trace.getSpan(ctx) : void 0;
}

function buildContextWithSentryScopes(context) {
  const currentScopes = getScopesFromContext(context);
  const currentScope = currentScopes?.scope || getCurrentScope();
  const currentIsolationScope = currentScopes?.isolationScope || getIsolationScope();
  const shouldForkIsolationScope = context.getValue(SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY) === true;
  const scope = context.getValue(SENTRY_FORK_SET_SCOPE_CONTEXT_KEY);
  const isolationScope = context.getValue(SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY);
  const newCurrentScope = scope || currentScope.clone();
  const newIsolationScope = isolationScope || (shouldForkIsolationScope ? currentIsolationScope.clone() : currentIsolationScope);
  const scopes = { scope: newCurrentScope, isolationScope: newIsolationScope };
  const ctx1 = setScopesOnContext(context, scopes);
  const ctx2 = ctx1.deleteValue(SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY).deleteValue(SENTRY_FORK_SET_SCOPE_CONTEXT_KEY).deleteValue(SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY);
  setContextOnScope(newCurrentScope, ctx2);
  return ctx2;
}

const ADD_LISTENER_METHODS = ["addListener", "on", "once", "prependListener", "prependOnceListener"];
class SentryAsyncLocalStorageContextManager {
  constructor(asyncLocalStorage) {
    this._kOtListeners = /* @__PURE__ */ Symbol("OtListeners");
    this._wrapped = false;
    this._asyncLocalStorage = asyncLocalStorage;
  }
  active() {
    return this._asyncLocalStorage.getStore() ?? ROOT_CONTEXT;
  }
  with(context, fn, thisArg, ...args) {
    const ctx2 = buildContextWithSentryScopes(context);
    const cb = thisArg == null ? fn : fn.bind(thisArg);
    return this._asyncLocalStorage.run(ctx2, cb, ...args);
  }
  enable() {
    return this;
  }
  disable() {
    try {
      this._asyncLocalStorage.disable();
    } catch {
    }
    return this;
  }
  bind(context, target) {
    if (isEventEmitter(target)) {
      return this._bindEventEmitter(context, target);
    }
    if (typeof target === "function") {
      return this._bindFunction(context, target);
    }
    return target;
  }
  /**
   * Gets underlying AsyncLocalStorage and symbol to allow lookup of scope.
   * This is Sentry-specific.
   */
  getAsyncLocalStorageLookup() {
    return {
      asyncLocalStorage: this._asyncLocalStorage,
      contextSymbol: SENTRY_SCOPES_CONTEXT_KEY
    };
  }
  _bindFunction(context, target) {
    const managerWith = this.with.bind(this);
    const contextWrapper = function(...args) {
      return managerWith(context, () => target.apply(this, args));
    };
    Object.defineProperty(contextWrapper, "length", {
      enumerable: false,
      configurable: true,
      writable: false,
      value: target.length
    });
    return contextWrapper;
  }
  _bindEventEmitter(context, ee) {
    if (this._getPatchMap(ee) !== void 0) {
      return ee;
    }
    if (this._createPatchMap(ee) === void 0) {
      return ee;
    }
    for (const methodName of ADD_LISTENER_METHODS) {
      const original = getMethod(ee, methodName);
      if (!original) continue;
      trySetMethod(ee, methodName, this._patchAddListener(ee, original, context));
    }
    for (const methodName of ["removeListener", "off"]) {
      const original = getMethod(ee, methodName);
      if (!original) continue;
      trySetMethod(ee, methodName, this._patchRemoveListener(ee, original));
    }
    const removeAllListeners = getMethod(ee, "removeAllListeners");
    if (removeAllListeners) {
      trySetMethod(ee, "removeAllListeners", this._patchRemoveAllListeners(ee, removeAllListeners));
    }
    return ee;
  }
  _patchRemoveListener(ee, original) {
    const contextManager = this;
    return function(event, listener) {
      const events = contextManager._getPatchMap(ee)?.[event];
      if (events === void 0) {
        return original.call(this, event, listener);
      }
      const patchedListener = events.get(listener);
      return original.call(this, event, patchedListener || listener);
    };
  }
  _patchRemoveAllListeners(ee, original) {
    const contextManager = this;
    return function(event) {
      const map = contextManager._getPatchMap(ee);
      if (map !== void 0) {
        if (arguments.length === 0) {
          contextManager._createPatchMap(ee);
        } else if (event !== void 0 && map[event] !== void 0) {
          delete map[event];
        }
      }
      return original.apply(this, arguments);
    };
  }
  _patchAddListener(ee, original, context) {
    const contextManager = this;
    return function(event, listener) {
      if (contextManager._wrapped) {
        return original.call(this, event, listener);
      }
      const map = contextManager._getPatchMap(ee) ?? contextManager._createPatchMap(ee);
      if (map === void 0) {
        return original.call(this, event, listener);
      }
      let listeners = map[event];
      if (listeners === void 0) {
        listeners = /* @__PURE__ */ new WeakMap();
        map[event] = listeners;
      }
      const patchedListener = contextManager.bind(context, listener);
      listeners.set(listener, patchedListener);
      contextManager._wrapped = true;
      try {
        return original.call(this, event, patchedListener);
      } finally {
        contextManager._wrapped = false;
      }
    };
  }
  /**
   * Attach a fresh patch map to the emitter. Returns `undefined` if the emitter does not accept the
   * property (e.g. it is frozen or sealed), in which case the emitter must not be patched at all —
   * without a patch map the remove-listener patches could not resolve their wrapped listeners.
   */
  _createPatchMap(ee) {
    const map = /* @__PURE__ */ Object.create(null);
    try {
      ee[this._kOtListeners] = map;
    } catch {
      return void 0;
    }
    return this._getPatchMap(ee) === map ? map : void 0;
  }
  _getPatchMap(ee) {
    return ee[this._kOtListeners];
  }
}
function isEventEmitter(target) {
  if (typeof target !== "object" || !target) {
    return false;
  }
  const candidate = target;
  return typeof candidate.on === "function" && typeof candidate.emit === "function";
}
function getMethod(ee, methodName) {
  const value = ee[methodName];
  return typeof value === "function" ? value : void 0;
}
function trySetMethod(ee, methodName, patched) {
  try {
    ee[methodName] = patched;
  } catch {
  }
}

function setOpenTelemetryContextAsyncContextStrategy() {
  const existingAsyncLocalStorage = getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.()?.asyncLocalStorage;
  const asyncLocalStorage = existingAsyncLocalStorage ?? new AsyncLocalStorage();
  function getScopes() {
    const ctx = api.context.active();
    const scopes = getScopesFromContext(ctx);
    if (scopes) {
      return scopes;
    }
    return {
      scope: getDefaultCurrentScope(),
      isolationScope: getDefaultIsolationScope()
    };
  }
  function withScope(callback) {
    const ctx = api.context.active();
    return api.context.with(ctx, () => {
      return callback(getCurrentScope());
    });
  }
  function withSetScope(scope, callback) {
    const ctx = getContextFromScope(scope) || api.context.active();
    return api.context.with(ctx.setValue(SENTRY_FORK_SET_SCOPE_CONTEXT_KEY, scope), () => {
      return callback(scope);
    });
  }
  function withIsolationScope(callback) {
    const ctx = api.context.active();
    return api.context.with(ctx.setValue(SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY, true), () => {
      const scope = getCurrentScope();
      if (!isContinuingTrace(scope.getPropagationContext())) {
        scope.setPropagationContext({
          traceId: generateTraceId(),
          sampleRand: _INTERNAL_safeMathRandom()
        });
      }
      return callback(getIsolationScope());
    });
  }
  function withSetIsolationScope(isolationScope, callback) {
    const ctx = api.context.active();
    return api.context.with(ctx.setValue(SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY, isolationScope), () => {
      return callback(getIsolationScope());
    });
  }
  function getCurrentScope() {
    return getScopes().scope;
  }
  function getIsolationScope() {
    return getScopes().isolationScope;
  }
  function getTracingChannelBinding() {
    return {
      asyncLocalStorage
    };
  }
  setAsyncContextStrategy({
    withScope,
    withSetScope,
    withSetIsolationScope,
    withIsolationScope,
    getCurrentScope,
    getIsolationScope,
    getActiveSpan,
    // The types here don't fully align, because our own `Span` type is narrower
    // than the OTEL one - but this is OK for here, as we now we'll only have OTEL spans passed around
    withActiveSpan,
    getTracingChannelBinding
  });
  const ctxManager = new SentryAsyncLocalStorageContextManager(asyncLocalStorage);
  api.context.setGlobalContextManager(ctxManager);
  return ctxManager.getAsyncLocalStorageLookup();
}

function getSamplingDecision(spanContext) {
  const { traceFlags, traceState } = spanContext;
  const sampledNotRecording = traceState ? traceState.get(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING) === "1" : false;
  if (traceFlags === TraceFlags.SAMPLED) {
    return true;
  }
  if (sampledNotRecording) {
    return false;
  }
  const dscString = traceState ? traceState.get(SENTRY_TRACE_STATE_DSC) : void 0;
  const dsc = dscString ? baggageHeaderToDynamicSamplingContext(dscString) : void 0;
  if (dsc?.sampled === "true") {
    return true;
  }
  if (dsc?.sampled === "false") {
    return false;
  }
  return void 0;
}

function registerPrepareSpanScope(client) {
  client.on("prepareSpanScope", (spanScope) => {
    const { scope, parentSpan } = spanScope;
    if (!parentSpan?.spanContext().isRemote) {
      return;
    }
    const { spanId, traceId, traceState } = parentSpan.spanContext();
    const dsc = getDynamicSamplingContextFromSpan(parentSpan);
    const sampleRand = typeof dsc.sample_rand === "string" ? Number(dsc.sample_rand) : void 0;
    const hasIncomingDsc = !!traceState?.get(SENTRY_TRACE_STATE_DSC);
    const forkedScope = scope.clone();
    forkedScope.setPropagationContext({
      traceId,
      parentSpanId: spanId,
      sampled: getSamplingDecision(parentSpan.spanContext()),
      dsc: hasIncomingDsc ? dsc : void 0,
      sampleRand: typeof sampleRand === "number" && !Number.isNaN(sampleRand) ? sampleRand : _INTERNAL_safeMathRandom()
    });
    _INTERNAL_setSpanForScope(forkedScope, void 0);
    spanScope.scope = forkedScope;
    spanScope.parentSpan = void 0;
  });
}

export { SentryPropagator, SentryTracerProvider, getScopesFromContext, registerPrepareSpanScope, setOpenTelemetryContextAsyncContextStrategy };
//# sourceMappingURL=index.js.map
