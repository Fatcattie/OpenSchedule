Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const attributes = require('@sentry/conventions/attributes');
const core = require('@sentry/core');
const server = require('@sentry/core/server');
const httpServerIntegration = require('./httpServerIntegration.js');
const httpServerSpansIntegration = require('./httpServerSpansIntegration.js');
const SentryHttpInstrumentation = require('./SentryHttpInstrumentation.js');

const INTEGRATION_NAME = "Http";
const httpIntegration = core.defineIntegration((options = {}) => {
  const spans = options.spans ?? true;
  const enableServerSpans = spans && !options.disableIncomingRequestSpans;
  const server$1 = httpServerIntegration.httpServerIntegration(options);
  const serverSpans = httpServerSpansIntegration.httpServerSpansIntegration(options);
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const clientOptions = client.getOptions();
      if (enableServerSpans && core.hasSpansEnabled(clientOptions)) {
        serverSpans.setup(client);
      }
    },
    setupOnce() {
      server$1.setupOnce();
      const outgoingRequestOptions = {
        breadcrumbs: options.breadcrumbs,
        spans,
        tracePropagation: options.tracePropagation ?? true,
        ignoreOutgoingRequests: options.ignoreOutgoingRequests,
        outgoingRequestHook: (span, request) => {
          const url = server.getRequestUrlFromClientRequest(request);
          if (url.startsWith("data:")) {
            const sanitizedUrl = core.stripDataUrlContent(url);
            const client = core.getClient();
            if (!client || !core.hasSpanStreamingEnabled(client)) {
              span.updateName(`${request.method || "GET"} ${sanitizedUrl}`);
            }
            span.setAttributes({
              [attributes.URL_FULL]: sanitizedUrl
            });
          }
          options.outgoingRequestHook?.(span, request);
        },
        outgoingResponseHook: options.outgoingResponseHook,
        outgoingRequestApplyCustomAttributes: options.outgoingRequestApplyCustomAttributes
      };
      SentryHttpInstrumentation.instrumentHttpOutgoingRequests(outgoingRequestOptions);
    },
    processEvent(event) {
      return serverSpans.processEvent(event);
    }
  };
});

exports.httpIntegration = httpIntegration;
//# sourceMappingURL=index.js.map
