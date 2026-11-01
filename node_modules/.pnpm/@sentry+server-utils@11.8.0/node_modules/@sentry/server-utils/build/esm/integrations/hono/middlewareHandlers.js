import { captureException, winterCGRequestToRequestData, getDefaultIsolationScope, getIsolationScope, getActiveSpan, getRootSpan, updateSpanName, INTERNAL_setSegmentNameSourceIfSegment, getClient } from '@sentry/core';
import { hasFetchEvent } from './hono-context.js';
import { defaultShouldHandleError } from './defaultShouldHandleError.js';
import { resolveRouteName } from './resolveRouteName.js';
import { HTTP_ROUTE } from '@sentry/conventions/attributes';

function requestHandler(context, getConnInfo) {
  const isolationScope = getCurrentIsolationScope();
  updateSpanRouteName(isolationScope, context);
  isolationScope.setSDKProcessingMetadata({
    normalizedRequest: winterCGRequestToRequestData(hasFetchEvent(context) ? context.event.request : context.req.raw)
  });
  if (getConnInfo) {
    setConnInfoAttributes(context, getConnInfo, isolationScope);
  }
}
function getCurrentIsolationScope() {
  const defaultScope = getDefaultIsolationScope();
  const currentIsolationScope = getIsolationScope();
  return defaultScope === currentIsolationScope ? defaultScope : currentIsolationScope;
}
function setConnInfoAttributes(context, getConnInfo, isolationScope) {
  const activeSpan = getActiveSpan();
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
  const ipAddress = address && getClient()?.getDataCollectionOptions().userInfo ? address : void 0;
  getRootSpan(activeSpan).setAttributes({
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
    if ((shouldHandleError ?? defaultShouldHandleError)(context.error)) {
      captureException(context.error, {
        mechanism: { handled: false, type: "auto.http.hono.context_error" }
      });
    }
  }
}
function updateSpanRouteName(isolationScope, context) {
  const route = resolveRouteName(context);
  const routeName = `${context.req.method} ${route}`;
  const activeSpan = getActiveSpan();
  if (activeSpan) {
    activeSpan.updateName(routeName);
    const rootSpan = getRootSpan(activeSpan);
    updateSpanName(rootSpan, routeName);
    INTERNAL_setSegmentNameSourceIfSegment(rootSpan, "route");
    rootSpan.setAttribute(HTTP_ROUTE, route);
  }
  isolationScope.setTransactionName(routeName);
}

export { captureContextError, requestHandler, responseHandler };
//# sourceMappingURL=middlewareHandlers.js.map
