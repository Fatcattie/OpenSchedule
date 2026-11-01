import type { Span } from '@opentelemetry/api';
import type { Scope } from '@sentry/core';
/**
 * Returns the currently active span, or the active span of the given scope's context.
 *
 * Spans with an invalid span context (e.g. a malformed incoming trace/span id put on the context by
 * a propagator) are ignored, matching the OTel SDK tracer, so consumers start a fresh trace instead
 * of continuing a broken one.
 */
export declare function getActiveSpan(scope?: Scope): Span | undefined;
//# sourceMappingURL=getActiveSpan.d.ts.map