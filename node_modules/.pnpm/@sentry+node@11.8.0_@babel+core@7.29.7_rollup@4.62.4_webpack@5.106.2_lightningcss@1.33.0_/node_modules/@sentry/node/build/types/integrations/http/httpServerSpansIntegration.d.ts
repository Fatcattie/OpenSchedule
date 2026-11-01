import type { Event, Integration, Span } from '@sentry/core';
import type { HttpIncomingMessage, HttpServerResponse } from '@sentry/core/server';
import type { NodeClient } from '../../sdk/client';
export interface HttpServerSpansIntegrationOptions {
    /**
     * Do not capture spans for incoming HTTP requests to URLs where the given callback returns `true`.
     * Spans will be non recording if tracing is disabled.
     *
     * The `urlPath` param consists of the URL path and query string (if any) of the incoming request.
     * For example: `'/users/details?id=123'`
     *
     * The `request` param contains the original {@type IncomingMessage} object of the incoming request.
     * You can use it to filter on additional properties like method, headers, etc.
     */
    ignoreIncomingRequests?: (urlPath: string, request: HttpIncomingMessage) => boolean;
    /**
     * Whether to automatically ignore common static asset requests like favicon.ico, robots.txt, etc.
     * This helps reduce noise in your transactions.
     *
     * @default `true`
     */
    ignoreStaticAssets?: boolean;
    /**
     * Do not capture spans for incoming HTTP requests with the given status codes.
     * By default, spans with some 3xx and 4xx status codes are ignored (see @default).
     * Expects an array of status codes or a range of status codes, e.g. [[300,399], 404] would ignore 3xx and 404 status codes.
     *
     * Important: This option is ignored by default! It only has an effect if `traceLifecycle` is set to `'static'`.
     *
     * @default `[[401, 404], [301, 303], [305, 399]]`
     *
     * @deprecated This option only has an effect if `traceLifecycle` is set to `'static'`. With span streaming
     * (`traceLifecycle: 'stream'`, the default), the SDK ignores it: child spans are sent as they end, before the
     * response status code is known, so a request's spans cannot be dropped retroactively. `ignoreStatusCodes` will be
     * removed in v12 of the SDK, without replacement.
     */
    ignoreStatusCodes?: (number | [number, number])[];
    /**
     * A hook that can be used to mutate the span for incoming requests.
     * This is triggered after the span is created, but before it is recorded.
     */
    onSpanCreated?: (span: Span, request: HttpIncomingMessage, response: HttpServerResponse) => void;
}
/**
 * This integration emits spans for incoming requests handled via the node `http` module.
 * It requires the `httpServerIntegration` to be present.
 */
export declare const httpServerSpansIntegration: (options?: HttpServerSpansIntegrationOptions) => Integration & {
    name: 'Http.ServerSpans';
    setup: (client: NodeClient) => void;
    processEvent: (event: Event) => Event | null;
};
/**
 * Check if a request is for a common static asset that should be ignored by default.
 *
 * Only exported for tests.
 */
export declare function isStaticAssetRequest(urlPath: string): boolean;
//# sourceMappingURL=httpServerSpansIntegration.d.ts.map