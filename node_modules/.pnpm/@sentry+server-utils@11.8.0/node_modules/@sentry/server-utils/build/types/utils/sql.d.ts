/**
 * Derives a low-cardinality summary from a SQL query for use as `db.query.summary`.
 *
 * Conforms to the OTEL semantic convention for generating query summaries:
 * - Preserves original case of operations and identifiers (no normalization)
 * - Uses format: `{operation} {target1} {target2} ...`
 * - Strips filler words (INTO, FROM) from the operation
 * - Captures multiple table targets (JOINs)
 * - Handles INSERT...SELECT with both targets
 * - Truncates to 255 characters without splitting mid-value
 *
 * @see https://opentelemetry.io/docs/specs/semconv/database/database-spans/#generating-a-summary-of-the-query
 */
export declare function getSqlQuerySummary(query: string | undefined): string | undefined;
/**
 * SQL dialect variants that matter for finding the end of a string literal:
 * - `standard` (PostgreSQL, SQLite): `"` quotes identifiers, `''` is the only in-string escape,
 *   and PostgreSQL's `$$…$$` dollar quoting opens a literal.
 * - `mysql`: `"` quotes a string literal unless `ANSI_QUOTES` is set, and `\` escapes the next
 *   character unless `NO_BACKSLASH_ESCAPES` is set. Both default to off, and mysql/mysql2 escape
 *   inlined values with backslashes, so this is the mode their statements arrive in.
 * - `mssql`: `[...]` quotes an identifier, so a `'` inside one is part of the name. `"` quotes
 *   one too, unless the connection sets `QUOTED_IDENTIFIER OFF`, which tedious leaves on.
 */
export type SqlDialect = 'standard' | 'mysql' | 'mssql';
/**
 * Maps a driver or `db.system.name` value to the dialect its statements are written in. Callers
 * report different spellings for one engine: knex uses the driver name, Prisma the provider name,
 * and OTel the semantic-convention name. An engine we do not know about is lexed as `standard`.
 */
export declare function toSqlDialect(system: unknown): SqlDialect;
/**
 * Sanitize SQL query as per the OTEL semantic conventions
 * https://opentelemetry.io/docs/specs/semconv/database/database-spans/#sanitization-of-dbquerytext
 *
 * Parameter placeholders survive: PostgreSQL `$n`, SQLite `?n`, and named forms like `:name` and
 * `@name`. Per the OTEL spec they mark a parameterized query, so only values (strings, numbers,
 * booleans) are sanitized.
 *
 * Pass `dialect` when the statement comes from a driver whose literals are not standard-quoted;
 * see {@link SqlDialect}.
 */
export declare function sanitizeSqlQuery(sqlQuery: string | undefined, dialect?: SqlDialect): string;
/**
 * Sanitizes a collected SQL statement and derives the matching `db.query.summary`, the pair the SQL
 * integrations attach to their spans. Both come back `undefined` when there is no statement, so an
 * empty query omits the attributes instead of reporting the sanitizer's fallback text.
 */
export declare function sanitizeSqlQueryWithSummary(sqlQuery: string | undefined, dialect?: SqlDialect): {
    queryText: string | undefined;
    querySummary: string | undefined;
};
//# sourceMappingURL=sql.d.ts.map