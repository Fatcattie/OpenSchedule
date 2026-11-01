import type { Client } from '../client';
import type { Span } from '../types/span';
import type { StartSpanOptions } from '../types/startSpanOptions';
/**
 * Lazily install the browser span streaming integration.
 *
 * Defaults to the current client; pass one explicitly from integration hooks, where the client being
 * set up isn't necessarily the current one.
 *
 * @internal
 */
export declare function _INTERNAL_ensureBrowserSpanStreaming(client?: Client | undefined): void;
/**
 * Wraps a function with a span and finishes the span after the function is done.
 *
 * See {@link startSpan} in `@sentry/core` for details.
 */
export declare function startSpan<T>(options: StartSpanOptions, callback: (span: Span) => T): T;
/**
 * Similar to `startSpan`, but forces the span to be ended manually.
 *
 * See {@link startSpanManual} in `@sentry/core` for details.
 */
export declare function startSpanManual<T>(options: StartSpanOptions, callback: (span: Span, finish: () => void) => T): T;
/**
 * Creates a span that is not set as active.
 *
 * See {@link startInactiveSpan} in `@sentry/core` for details.
 */
export declare function startInactiveSpan(options: StartSpanOptions): Span;
//# sourceMappingURL=browserSpanApi.d.ts.map