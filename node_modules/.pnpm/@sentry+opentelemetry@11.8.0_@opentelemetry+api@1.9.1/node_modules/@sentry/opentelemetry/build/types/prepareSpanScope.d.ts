import type { Client } from '@sentry/core';
/**
 * Registers the `prepareSpanScope` hook on the client.
 *
 * A remote parent is an incoming trace on the ambient OTel context, set by the propagator. It
 * cannot be used as a local parent span. The hook continues its trace through the propagation
 * context of a forked scope instead, so the span is created as a root span of the incoming trace,
 * like the OpenTelemetry SDK does for remote parents.
 */
export declare function registerPrepareSpanScope(client: Client): void;
//# sourceMappingURL=prepareSpanScope.d.ts.map