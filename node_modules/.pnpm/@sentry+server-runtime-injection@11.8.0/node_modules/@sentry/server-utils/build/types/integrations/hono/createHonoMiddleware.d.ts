import type { Context, GetConnInfo, MiddlewareHandler } from './honoTypes';
import type { SentryHonoMiddlewareOptions } from './types';
export declare const SENTRY_HONO_MIDDLEWARE = "__SENTRY_HONO_MIDDLEWARE__";
export interface CreateHonoRequestMiddlewareOptions {
    /**
     * Runtime-specific `getConnInfo` helper (e.g. `@hono/node-server/conninfo`, `hono/bun`).
     * Optional — connection-info attributes are simply skipped when it is not provided.
     */
    getConnInfo?: GetConnInfo;
    /** Static `shouldHandleError` callback (Node/Bun/Deno). */
    shouldHandleError?: SentryHonoMiddlewareOptions['shouldHandleError'];
    /**
     * Resolves `shouldHandleError` per request from the context. Cloudflare accepts
     * middleware options as a function of `env`, so the callback is only known once a
     * request comes in. When provided, this wins over the static `shouldHandleError`.
     */
    resolveShouldHandleError?: (context: Context) => SentryHonoMiddlewareOptions['shouldHandleError'];
}
/**
 * Builds the core Sentry request/response Hono middleware: it names the transaction, records the
 * request, and captures unhandled context errors around `next()`.
 *
 * Idempotent per request (see {@link getRequestScope}), so duplicate registrations — a manual
 * `sentry()` alongside the auto-instrumentation, mounted sub-apps, internal `.request()` dispatches —
 * are all safe and run the handling exactly once.
 *
 * A user-provided `shouldHandleError` still takes effect even when the middleware carrying it is
 * deduplicated behind the auto-instrumentation (which is prepended first, per request, from the
 * `Context` constructor hook): the deduplicated middleware records its callback on the request scope, and the
 * middleware that actually runs `responseHandler` uses it in preference to its own default.
 */
export declare function createHonoRequestMiddleware(options?: CreateHonoRequestMiddlewareOptions): MiddlewareHandler;
//# sourceMappingURL=createHonoMiddleware.d.ts.map