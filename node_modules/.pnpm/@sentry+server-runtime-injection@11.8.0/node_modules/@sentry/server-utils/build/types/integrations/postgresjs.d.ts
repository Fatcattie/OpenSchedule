import { type Span, type SpanAttributes } from '@sentry/core';
export type PostgresConnectionContext = {
    ATTR_DB_NAMESPACE?: string;
    ATTR_SERVER_ADDRESS?: string;
    ATTR_SERVER_PORT?: string;
};
interface PostgresJsSqlInstrumentationOptions {
    /**
     * Whether to require a parent span for the instrumentation.
     * If set to true, the instrumentation will only create spans if there is a parent span
     * available in the current scope.
     * @default true
     */
    requireParentSpan?: boolean;
    /**
     * Hook to modify the span before it is started.
     * This can be used to set additional attributes or modify the span in any way.
     */
    requestHook?: (span: Span, sanitizedSqlQuery: string, postgresConnectionContext?: PostgresConnectionContext) => void;
}
/**
 * Instruments a postgres.js `sql` instance with Sentry tracing.
 *
 * This is a portable instrumentation function that works in any environment
 * (Node.js, Cloudflare Workers, etc.) without depending on OpenTelemetry.
 *
 * @example
 * ```javascript
 * import postgres from 'postgres';
 * import * as Sentry from '@sentry/cloudflare'; // or '@sentry/deno'
 *
 * const sql = Sentry.instrumentPostgresJsSql(
 *   postgres({ host: 'localhost', database: 'mydb' })
 * );
 *
 * // All queries now create Sentry spans
 * await sql`SELECT * FROM users WHERE id = ${userId}`;
 * ```
 */
export declare function instrumentPostgresJsSql<T>(sql: T, options?: PostgresJsSqlInstrumentationOptions): T;
/**
 * Reconstructs the full SQL query from template strings with PostgreSQL placeholders.
 *
 * For sql`SELECT * FROM users WHERE id = ${123} AND name = ${'foo'}`:
 *   strings = ["SELECT * FROM users WHERE id = ", " AND name = ", ""]
 *   returns: "SELECT * FROM users WHERE id = $1 AND name = $2"
 *
 * @internal Exported for testing only
 */
export declare function _reconstructQuery(strings: string[] | undefined): string | undefined;
/**
 * Returns connection context attributes.
 *
 * @internal Exported for the diagnostics-channel integration.
 */
export declare function _getConnectionAttributes(connectionContext: PostgresConnectionContext): SpanAttributes;
/**
 * Extracts the DB operation name from a SQL query, preferring the server-reported `command`.
 *
 * @internal Exported for the diagnostics-channel integration.
 */
export declare function _getOperationName(sanitizedQuery: string | undefined, command?: string): string | undefined;
/**
 * Builds a {@link PostgresConnectionContext} from postgres.js' parsed options
 * (which store `host`/`port` as arrays). Defaults to 'localhost'/5432.
 *
 * @internal Exported for the diagnostics-channel integration.
 */
export declare function _buildConnectionContext(options: {
    host?: string[];
    port?: number[];
    database?: string;
}): PostgresConnectionContext;
export {};
//# sourceMappingURL=postgresjs.d.ts.map