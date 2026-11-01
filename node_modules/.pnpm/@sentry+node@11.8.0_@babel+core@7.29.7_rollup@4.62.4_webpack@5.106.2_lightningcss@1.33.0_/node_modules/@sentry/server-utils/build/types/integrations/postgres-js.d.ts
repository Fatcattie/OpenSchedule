import type { Span } from '@sentry/core';
import { type PostgresConnectionContext } from './postgresjs';
export interface PostgresJsIntegrationOptions {
    /**
     * Only create spans when there's already an active parent span. Defaults to
     * `true`, matching the OTel `postgresJsIntegration`.
     */
    requireParentSpan?: boolean;
    /**
     * Hook to modify the query span before the query runs. Receives the span, the
     * sanitized SQL, and (when resolvable) the connection context.
     */
    requestHook?: (span: Span, sanitizedSqlQuery: string, postgresConnectionContext?: PostgresConnectionContext) => void;
}
/**
 * Diagnostics-channel-based postgres.js (`postgres` v3.x) integration.
 *
 * Subscribes to the `orchestrion:postgres:handle` / `:connection` / `:execute` /
 * `:connect` diagnostics channels injected into postgres.js' `Query.prototype.handle`
 * and `Connection`/`execute`/`connect` (in `src/*` and `cjs/src/*`) and creates db
 * spans matching the OTel `postgresJsIntegration`. Requires the Sentry runtime
 * hook or bundler plugin.
 */
export declare const postgresJsIntegration: (options?: PostgresJsIntegrationOptions | undefined) => import("@sentry/core").Integration & {
    name: "PostgresJs";
};
//# sourceMappingURL=postgres-js.d.ts.map