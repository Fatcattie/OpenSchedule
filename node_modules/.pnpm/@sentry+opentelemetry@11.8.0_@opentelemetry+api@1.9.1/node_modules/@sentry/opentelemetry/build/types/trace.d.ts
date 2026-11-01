import type { Span } from '@opentelemetry/api';
import type { Scope } from '@sentry/core';
/**
 * Forks the current scope and sets the provided span as active span in the context of the provided callback. Can be
 * passed `null` to start an entirely new span tree.
 *
 * @param span Spans started in the context of the provided callback will be children of this span. If `null` is passed,
 * spans started within the callback will be root spans.
 * @param callback Execution context in which the provided span will be active. Is passed the newly forked scope.
 * @returns the value returned from the provided callback function.
 */
export declare function withActiveSpan<T>(span: Span | null, callback: (scope: Scope) => T): T;
//# sourceMappingURL=trace.d.ts.map