Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const honoContext = require('./hono-context.js');
const defaultShouldHandleError = require('./defaultShouldHandleError.js');
const resolveRouteName = require('./resolveRouteName.js');
const attributes = require('@sentry/conventions/attributes');

function requestHandler(context, getConnInfo) {
  const isolationScope = getCurrentIsolationScope();
  updateSpanRouteName(isolationScope, context);
  isolationScope.setSDKProcessingMetadata({
    normalizedRequest: core.winterCGRequestToRequestData(honoContext.hasFetchEvent(context) ? context.event.request : context.req.raw)
  });
  if (getConnInfo) {
    setConnInfoAttributes(context, getConnInfo, isolationScope);
  }
}
function getCurrentIsolationScope() {
  const defaultScope = core.getDefaultIsolationScope();
  const currentIsolationScope = core.getIsolationScope();
  return defaultScope === currentIsolationScope ? defaultScope : currentIsolationScope;
}
function setConnInfoAttributes(context, getConnInfo, isolationScope) {
  const activeSpan = core.getActiveSpan();
  if (!activeSpan) {
    return;
  }
  let remote;
  try {
    remote = getConnInfo(context).remote;
  } catch {
    return;
  }
  const { address, port, transport, addressType } = remote || {};
  const ipAddress = address && core.getClient()?.getDataCollectionOptions().userInfo ? address : void 0;
  core.getRootSpan(activeSpan).setAttributes({
    "client.port": port,
    "network.peer.port": port,
    "network.transport": transport,
    "network.type": addressType?.toLowerCase(),
    "client.address": ipAddress,
    "network.peer.address": ipAddress
  });
  if (ipAddress) {
    isolationScope.setUser({ ...isolationScope.getUser(), ip_address: ipAddress });
  }
}
function responseHandler(context, shouldHandleError) {
  updateSpanRouteName(getCurrentIsolationScope(), context);
  captureContextError(context, shouldHandleError);
}
function captureContextError(context, shouldHandleError) {
  if (context.error) {
    if ((shouldHandleError ?? defaultShouldHandleError.defaultShouldHandleError)(context.error)) {
      core.captureException(context.error, {
        mechanism: { handled: false, type: "auto.http.hono.context_error" }
      });
    }
  }
}
function updateSpanRouteName(isolationScope, context) {
  const route = resolveRouteName.resolveRouteName(context);
  const routeName = `${context.req.method} ${route}`;
  const activeSpan = core.getActiveSpan();
  if (activeSpan) {
    activeSpan.updateName(routeName);
    const rootSpan = core.getRootSpan(activeSpan);
    core.updateSpanName(rootSpan, routeName);
    core.INTERNAL_setSegmentNameSourceIfSegment(rootSpan, "route");
    rootSpan.setAttribute(attributes.HTTP_ROUTE, route);
  }
  isolationScope.setTransactionName(routeName);
}

exports.captureContextError = captureContextError;
exports.requestHandler = requestHandler;
exports.responseHandler = responseHandler;
//# sourceMappingURL=middlewareHandlers.js.map
