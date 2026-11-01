import type { Context } from '@opentelemetry/api';
/** Returns a new context with tracing suppressed, so no spans are created within it. */
export declare function suppressTracing(context: Context): Context;
/** Whether tracing is suppressed in the given context. */
export declare function isTracingSuppressed(context: Context): boolean;
//# sourceMappingURL=suppressTracing.d.ts.map