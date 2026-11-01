import type { RequestOptions } from 'node:http';
import type { HttpServerIntegrationOptions } from './httpServerIntegration';
import type { HttpServerSpansIntegrationOptions } from './httpServerSpansIntegration';
import type { OutgoingHttpRequestInstrumentationOptions } from './SentryHttpInstrumentation';
interface HttpOptions extends HttpServerIntegrationOptions, HttpServerSpansIntegrationOptions {
    /**
     * Whether breadcrumbs should be recorded for outgoing requests.
     * Defaults to true
     */
    breadcrumbs?: boolean;
    /**
     * If set to false, do not emit any spans.
     * This will ensure that the default HttpInstrumentation from OpenTelemetry is not setup,
     * only the Sentry-specific instrumentation for request isolation is applied.
     *
     * Defaults to `true` when tracing is enabled.
     */
    spans?: boolean;
    /**
     * Whether to inject trace propagation headers (sentry-trace, baggage, traceparent) into outgoing HTTP requests.
     *
     * When set to `false`, Sentry will not inject any trace propagation headers, but will still create breadcrumbs
     * (if `breadcrumbs` is enabled). This is useful when you run your own OpenTelemetry `HttpInstrumentation` and
     * want to avoid duplicate trace headers being injected by both Sentry and OpenTelemetry.
     *
     * @default `true`
     */
    tracePropagation?: boolean;
    /**
     * Do not capture spans or breadcrumbs for outgoing HTTP requests to URLs where the given callback returns `true`.
     * This controls both span & breadcrumb creation - spans will be non recording if tracing is disabled.
     *
     * The `url` param contains the entire URL, including query string (if any), protocol, host, etc. of the outgoing request.
     * For example: `'https://someService.com/users/details?id=123'`
     *
     * The `request` param contains the original {@type RequestOptions} object used to make the outgoing request.
     * You can use it to filter on additional properties like method, headers, etc.
     */
    ignoreOutgoingRequests?: (url: string, request: RequestOptions) => boolean;
    /**
     * If true, do not generate spans for incoming requests at all.
     * This is used by Remix to avoid generating spans for incoming requests, as it generates its own spans.
     */
    disableIncomingRequestSpans?: boolean;
    /**
     * Called after an outgoing request span is created.
     * Only invoked when spans are created for outgoing requests.
     */
    outgoingRequestHook?: OutgoingHttpRequestInstrumentationOptions['outgoingRequestHook'];
    /**
     * Called when the outgoing request receives a response.
     * Only invoked when spans are created for outgoing requests.
     */
    outgoingResponseHook?: OutgoingHttpRequestInstrumentationOptions['outgoingResponseHook'];
    /**
     * Called when both the outgoing request and response are available.
     * Only invoked when spans are created for outgoing requests.
     */
    outgoingRequestApplyCustomAttributes?: OutgoingHttpRequestInstrumentationOptions['outgoingRequestApplyCustomAttributes'];
}
/**
 * The http integration instruments Node's internal http and https modules.
 * It creates breadcrumbs and spans for outgoing HTTP requests which will be attached to the currently active span.
 */
export declare const httpIntegration: (options?: HttpOptions | undefined) => import("@sentry/core").Integration & {
    name: "Http";
};
export {};
//# sourceMappingURL=index.d.ts.map