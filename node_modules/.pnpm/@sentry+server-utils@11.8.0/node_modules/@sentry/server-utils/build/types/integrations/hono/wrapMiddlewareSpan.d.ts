import { type MiddlewareHandler } from './honoTypes';
/**
 * Wraps a Hono middleware handler so that its execution is traced as a Sentry span.
 * Explicitly parents each span under the root (transaction) span so that all middleware
 * spans are siblings — even when OTel instrumentation introduces nested active contexts
 * (onion order: A → B → handler → B → A would otherwise nest B under A).
 */
export declare function wrapMiddlewareWithSpan(handler: MiddlewareHandler): MiddlewareHandler;
//# sourceMappingURL=wrapMiddlewareSpan.d.ts.map