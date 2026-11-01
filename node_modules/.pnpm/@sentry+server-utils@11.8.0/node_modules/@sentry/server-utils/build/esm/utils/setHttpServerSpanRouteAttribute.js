import { SENTRY_OP, HTTP_REQUEST_METHOD, HTTP_METHOD, HTTP_ROUTE, SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import { getActiveSpan, getRootSpan, spanToJSON } from '@sentry/core';

function setHttpServerSpanRouteAttribute(route) {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    return;
  }
  const rootSpan = getRootSpan(activeSpan);
  if (!rootSpan) {
    return;
  }
  const attributes = spanToJSON(rootSpan).attributes;
  if (attributes[SENTRY_OP] !== "http.server") {
    return;
  }
  const method = attributes[HTTP_REQUEST_METHOD] || attributes[HTTP_METHOD] || "GET";
  rootSpan.setAttribute(HTTP_ROUTE, route);
  rootSpan.updateName(`${method} ${route}`);
  rootSpan.setAttribute(SENTRY_SEGMENT_NAME_SOURCE, "route");
}

export { setHttpServerSpanRouteAttribute };
//# sourceMappingURL=setHttpServerSpanRouteAttribute.js.map
