/**
 * Lets a `safeCallback` fallback signal "the callback failed" as opposed to "the callback returned `null`",
 * so the call site can report the drop as `callback_error`. Always return it, never throw it: a thrown
 * sentinel would have to be caught at every boundary, and some of those (e.g. `prepareEvent`) are public.
 */
export declare const CALLBACK_ERROR: unique symbol;
/**
 * Invokes a user-provided callback (e.g. `beforeSend`, `tracesSampler`, an integration hook) so that
 * neither a synchronous throw nor a rejected promise escapes into the caller. On failure the error is
 * logged and `fallback(error)` supplies the result instead.
 *
 * Not for `startSpan` bodies: those must re-throw and are handled by `handleCallbackErrors`.
 *
 * @param message - Logged via `debug.error` together with the error. Pass it as `DEBUG_BUILD ? '...' : ''`
 *   so the string is tree-shaken from non-debug bundles.
 * @param fn - Invokes the callback.
 * @param fallback - Produces the result to use when the callback throws or rejects.
 */
export declare function safeCallback<T>(message: string, fn: () => T, fallback: (error: unknown) => T): T;
//# sourceMappingURL=safeCallback.d.ts.map