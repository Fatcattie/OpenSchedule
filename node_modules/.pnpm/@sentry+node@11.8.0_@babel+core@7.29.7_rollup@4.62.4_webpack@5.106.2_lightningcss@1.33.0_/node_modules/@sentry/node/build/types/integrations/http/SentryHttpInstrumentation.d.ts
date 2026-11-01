import type { ClientRequest, IncomingMessage } from 'node:http';
import type { Span } from '@sentry/core';
import type { HttpClientRequest, HttpIncomingMessage } from '@sentry/core/server';
import * as http from 'node:http';
export interface OutgoingHttpRequestInstrumentationOptions {
    /**
     * Whether breadcrumbs should be recorded for outgoing requests.
     *
     * @default `true`
     */
    breadcrumbs?: boolean;
    /**
     * Whether to create spans for outgoing requests.
     *
     * @default `true`
     */
    spans?: boolean;
    /**
     * Whether to propagate Sentry trace headers in outgoing requests.
     *
     * @default `true`
     */
    tracePropagation?: boolean;
    /**
     * Do not instrument outgoing HTTP requests to URLs where the given callback returns `true`.
     * When it returns `true`, the request is skipped entirely: no breadcrumb and no span are created,
     * and no trace headers are propagated for that request.
     *
     * @param url Contains the entire URL, including query string (if any), protocol, host, etc. of the outgoing request.
     * @param request Contains the {@type RequestOptions} object used to make the outgoing request.
     */
    ignoreOutgoingRequests?: (url: string, request: http.RequestOptions) => boolean;
    /**
     * Hooks for outgoing request spans, only called when spans are created for outgoing requests
     * (i.e. when `spans` is enabled).
     */
    outgoingRequestHook?: (span: Span, request: ClientRequest) => void;
    outgoingResponseHook?: (span: Span, response: IncomingMessage) => void;
    outgoingRequestApplyCustomAttributes?: (span: Span, request: HttpClientRequest, response: HttpIncomingMessage) => void;
}
/**
 * This instruments the http modules for outgoing requests.
 * It uses the diagnostics channel if available, otherwise it falls back to monkey-patching.
 *
 * The instrumentation will start spans, create breadcrumbs, and propagate trace headers in outgoing requests (depending on the settings).
 */
export declare function instrumentHttpOutgoingRequests(instrumentationOptions?: OutgoingHttpRequestInstrumentationOptions): void;
//# sourceMappingURL=SentryHttpInstrumentation.d.ts.map