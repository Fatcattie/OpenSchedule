import type { Integration } from '../types/integration';
import type { SpanOrigin } from '../types/span';
export interface FetchIntegrationOptions {
    /**
     * Whether breadcrumbs should be recorded for requests.
     *
     * @default `true`
     */
    breadcrumbs?: boolean;
    /**
     * Function determining whether or not to create spans to track outgoing requests to the given URL.
     * By default, spans will be created for all outgoing requests.
     */
    shouldCreateSpanForRequest?: (url: string) => boolean;
    /**
     * Whether to inject trace propagation headers (`sentry-trace`, `baggage`) into outgoing requests.
     *
     * To scope propagation to specific URLs, configure `tracePropagationTargets` in the client options
     * instead. Turn this off only to suppress propagation entirely, for example alongside
     * `shouldCreateSpanForRequest`, which suppresses the span but not the headers.
     *
     * Covers the global `fetch` only. A runtime that also instruments another HTTP client switches
     * that one separately, for example `denoHttpIntegration({ tracePropagation: false })`.
     *
     * @default `true`
     */
    tracePropagation?: boolean;
}
interface CreateFetchIntegrationOptions {
    /** Integration name, e.g. `'Fetch'`. */
    name: string;
    /** Span origin for the `http.client` spans this integration creates. */
    spanOrigin: SpanOrigin;
}
/**
 * Builds an integration that instruments the global `fetch` function: creates `http.client` spans,
 * records breadcrumbs, and attaches trace propagation headers.
 *
 * Runtimes that patch the global `fetch` (Bun, Cloudflare Workers, Deno, Vercel Edge) differ only in
 * the integration name and span origin, so they all share this implementation. Node is not one of
 * them: it instruments undici through diagnostics channels instead. Neither is the browser, whose
 * fetch tracing is driven by `browserTracingIntegration` and shares its span map with XHR.
 */
export declare function createFetchIntegration({ name, spanOrigin, }: CreateFetchIntegrationOptions): (options?: FetchIntegrationOptions) => Integration;
export {};
//# sourceMappingURL=fetch.d.ts.map