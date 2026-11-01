Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const attributes = require('@sentry/conventions/attributes');
const core = require('@sentry/core');

function setHttpServerSpanRouteAttribute(route) {
  const activeSpan = core.getActiveSpan();
  if (!activeSpan) {
    return;
  }
  const rootSpan = core.getRootSpan(activeSpan);
  if (!rootSpan) {
    return;
  }
  const attributes$1 = core.spanToJSON(rootSpan).attributes;
  if (attributes$1[attributes.SENTRY_OP] !== "http.server") {
    return;
  }
  const method = attributes$1[attributes.HTTP_REQUEST_METHOD] || attributes$1[attributes.HTTP_METHOD] || "GET";
  rootSpan.setAttribute(attributes.HTTP_ROUTE, route);
  rootSpan.updateName(`${method} ${route}`);
  rootSpan.setAttribute(attributes.SENTRY_SEGMENT_NAME_SOURCE, "route");
}

exports.setHttpServerSpanRouteAttribute = setHttpServerSpanRouteAttribute;
//# sourceMappingURL=setHttpServerSpanRouteAttribute.js.map
