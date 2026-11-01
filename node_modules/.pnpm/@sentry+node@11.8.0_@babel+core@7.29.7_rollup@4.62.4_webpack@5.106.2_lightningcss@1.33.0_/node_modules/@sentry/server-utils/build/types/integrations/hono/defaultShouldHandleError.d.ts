/**
 * Default implementation of the `shouldHandleError` callback.
 *
 * Returns `true` (capture) for 5xx errors and any error without a `status` property
 *
 * Returns `false` (skip) for 3xx and 4xx errors (they still generate spans and transactions for tracing)
 *
 * Checks any error-like value that carries a numeric `status` property. This covers
 * Hono's `HTTPException`, third-party middleware errors, and custom error subclasses.
 */
export declare function defaultShouldHandleError(error: unknown): boolean;
//# sourceMappingURL=defaultShouldHandleError.d.ts.map