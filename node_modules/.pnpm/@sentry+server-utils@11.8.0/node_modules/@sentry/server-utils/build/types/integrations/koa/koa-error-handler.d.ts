/**
 * Key under which the koa instrumentation stashes the request's active span on
 * the koa `ctx`. Koa emits its `error` event from `handleRequest`'s `.catch()`,
 * *after* the middleware chain has unwound and no span is active — so we capture
 * within this stashed span to keep the error linked to the request's trace.
 */
export declare const KOA_CONTEXT_SPAN = "__SENTRY_KOA_SPAN__";
/** The subset of a koa `Application` the error handler needs (it extends `EventEmitter`). */
export interface KoaApp {
    on(event: 'error', listener: (error: unknown, context?: unknown) => void): unknown;
    [key: string]: unknown;
}
/**
 * Attach a Sentry error listener to a koa app's `error` event.
 *
 * Koa emits `'error'` for every request error that bubbles up unhandled, so a
 * single `app.on('error')` listener captures the same errors a top-level
 * try/catch middleware would — without depending on middleware order. The error
 * is captured within the request's koa span (stashed on the koa `ctx` under
 * {@link KOA_CONTEXT_SPAN}) so it keeps its trace linkage, since koa emits the
 * event after the middleware spans have already ended.
 *
 * Idempotent — the app is marked so auto-registration (via the `callback`
 * channel) and any explicit `setupKoaErrorHandler` call never stack up multiple
 * listeners.
 *
 * @deprecated Internal. The error handler is registered automatically by the koa
 * instrumentation; there is no need to call this directly. It is exported only
 * so the deprecated `setupKoaErrorHandler` can delegate to it, and will be
 * removed in a future major version.
 */
export declare function attachKoaErrorHandler(app: KoaApp): void;
//# sourceMappingURL=koa-error-handler.d.ts.map