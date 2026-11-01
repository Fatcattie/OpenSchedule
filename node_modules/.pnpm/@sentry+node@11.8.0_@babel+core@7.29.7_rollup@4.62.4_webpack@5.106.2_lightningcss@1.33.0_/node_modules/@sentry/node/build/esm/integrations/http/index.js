import { URL_FULL } from '@sentry/conventions/attributes';
import { defineIntegration, hasSpansEnabled, stripDataUrlContent, getClient, hasSpanStreamingEnabled } from '@sentry/core';
import { getRequestUrlFromClientRequest } from '@sentry/core/server';
import { httpServerIntegration } from './httpServerIntegration.js';
import { httpServerSpansIntegration } from './httpServerSpansIntegration.js';
import { instrumentHttpOutgoingRequests } from './SentryHttpInstrumentation.js';

const INTEGRATION_NAME = "Http";
const httpIntegration = defineIntegration((options = {}) => {
  const spans = options.spans ?? true;
  const enableServerSpans = spans && !options.disableIncomingRequestSpans;
  const server = httpServerIntegration(options);
  const serverSpans = httpServerSpansIntegration(options);
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const clientOptions = client.getOptions();
      if (enableServerSpans && hasSpansEnabled(clientOptions)) {
        serverSpans.setup(client);
      }
    },
    setupOnce() {
      server.setupOnce();
      const outgoingRequestOptions = {
        breadcrumbs: options.breadcrumbs,
        spans,
        tracePropagation: options.tracePropagation ?? true,
        ignoreOutgoingRequests: options.ignoreOutgoingRequests,
        outgoingRequestHook: (span, request) => {
          const url = getRequestUrlFromClientRequest(request);
          if (url.startsWith("data:")) {
            const sanitizedUrl = stripDataUrlContent(url);
            const client = getClient();
            if (!client || !hasSpanStreamingEnabled(client)) {
              span.updateName(`${request.method || "GET"} ${sanitizedUrl}`);
            }
            span.setAttributes({
              [URL_FULL]: sanitizedUrl
            });
          }
          options.outgoingRequestHook?.(span, request);
        },
        outgoingResponseHook: options.outgoingResponseHook,
        outgoingRequestApplyCustomAttributes: options.outgoingRequestApplyCustomAttributes
      };
      instrumentHttpOutgoingRequests(outgoingRequestOptions);
    },
    processEvent(event) {
      return serverSpans.processEvent(event);
    }
  };
});

export { httpIntegration };
//# sourceMappingURL=index.js.map
