Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const api = require('@opentelemetry/api');
const core = require('@sentry/core');
const server = require('@sentry/core/server');
const serverUtils = require('@sentry/server-utils');
const nodeVersion = require('../../nodeVersion.js');
const node_events = require('node:events');
const http = require('node:http');

const FULLY_SUPPORTS_HTTP_DIAGNOSTICS_CHANNEL = nodeVersion.NODE_VERSION.major === 22 && nodeVersion.NODE_VERSION.minor >= 12 || nodeVersion.NODE_VERSION.major === 23 && nodeVersion.NODE_VERSION.minor >= 2 || nodeVersion.NODE_VERSION.major >= 24;
function instrumentHttpOutgoingRequests(instrumentationOptions = {}) {
  const { outgoingRequestApplyCustomAttributes: applyCustomAttributesOnSpan, ...options } = instrumentationOptions;
  const patchOptions = {
    applyCustomAttributesOnSpan,
    ...options,
    tracePropagation: options.tracePropagation ?? true,
    spans: options.spans ?? true,
    ignoreOutgoingRequests(url, request) {
      return core.isTracingSuppressed() || !!options.ignoreOutgoingRequests?.(url, server.getRequestOptions(request));
    },
    outgoingRequestHook(span, request) {
      options.outgoingRequestHook?.(span, request);
      const originalOnce = request.once;
      const newOnce = new Proxy(originalOnce, {
        apply(target, thisArg, args) {
          const [event] = args;
          if (event !== "response") {
            return target.apply(thisArg, args);
          }
          const parentContext = api.context.active();
          const requestContext = api.trace.setSpan(parentContext, span);
          return api.context.with(requestContext, () => {
            return target.apply(thisArg, args);
          });
        }
      });
      request.once = newOnce;
    },
    outgoingResponseHook(span, response) {
      options.outgoingResponseHook?.(span, response);
    },
    errorMonitor: node_events.errorMonitor,
    // Pass these in to detect OTel double-wrapping if we're enabling spans
    http
  };
  if (FULLY_SUPPORTS_HTTP_DIAGNOSTICS_CHANNEL) {
    instrumentHttpOutgoingRequestsViaChannel(patchOptions);
  } else {
    instrumentHttpOutgoingRequestsViaMonkeyPatching(patchOptions);
  }
}
function instrumentHttpOutgoingRequestsViaChannel(options) {
  const { [server.HTTP_ON_CLIENT_REQUEST]: onHttpClientRequestCreated } = server.getHttpClientSubscriptions(options);
  serverUtils.subscribeDiagnosticsChannel(server.HTTP_ON_CLIENT_REQUEST, onHttpClientRequestCreated);
}
function instrumentHttpOutgoingRequestsViaMonkeyPatching(options) {
  server.patchHttpModuleClient(http, options);
}

exports.instrumentHttpOutgoingRequests = instrumentHttpOutgoingRequests;
//# sourceMappingURL=SentryHttpInstrumentation.js.map
