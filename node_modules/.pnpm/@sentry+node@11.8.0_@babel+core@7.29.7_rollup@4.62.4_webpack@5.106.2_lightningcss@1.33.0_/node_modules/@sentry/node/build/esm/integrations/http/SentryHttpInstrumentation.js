import { context, trace } from '@opentelemetry/api';
import { isTracingSuppressed } from '@sentry/core';
import { getHttpClientSubscriptions, HTTP_ON_CLIENT_REQUEST, patchHttpModuleClient, getRequestOptions } from '@sentry/core/server';
import { subscribeDiagnosticsChannel } from '@sentry/server-utils';
import { NODE_VERSION } from '../../nodeVersion.js';
import { errorMonitor } from 'node:events';
import * as http from 'node:http';

const FULLY_SUPPORTS_HTTP_DIAGNOSTICS_CHANNEL = NODE_VERSION.major === 22 && NODE_VERSION.minor >= 12 || NODE_VERSION.major === 23 && NODE_VERSION.minor >= 2 || NODE_VERSION.major >= 24;
function instrumentHttpOutgoingRequests(instrumentationOptions = {}) {
  const { outgoingRequestApplyCustomAttributes: applyCustomAttributesOnSpan, ...options } = instrumentationOptions;
  const patchOptions = {
    applyCustomAttributesOnSpan,
    ...options,
    tracePropagation: options.tracePropagation ?? true,
    spans: options.spans ?? true,
    ignoreOutgoingRequests(url, request) {
      return isTracingSuppressed() || !!options.ignoreOutgoingRequests?.(url, getRequestOptions(request));
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
          const parentContext = context.active();
          const requestContext = trace.setSpan(parentContext, span);
          return context.with(requestContext, () => {
            return target.apply(thisArg, args);
          });
        }
      });
      request.once = newOnce;
    },
    outgoingResponseHook(span, response) {
      options.outgoingResponseHook?.(span, response);
    },
    errorMonitor,
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
  const { [HTTP_ON_CLIENT_REQUEST]: onHttpClientRequestCreated } = getHttpClientSubscriptions(options);
  subscribeDiagnosticsChannel(HTTP_ON_CLIENT_REQUEST, onHttpClientRequestCreated);
}
function instrumentHttpOutgoingRequestsViaMonkeyPatching(options) {
  patchHttpModuleClient(http, options);
}

export { instrumentHttpOutgoingRequests };
//# sourceMappingURL=SentryHttpInstrumentation.js.map
