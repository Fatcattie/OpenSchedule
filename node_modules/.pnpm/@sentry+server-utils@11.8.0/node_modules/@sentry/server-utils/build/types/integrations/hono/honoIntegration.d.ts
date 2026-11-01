import type { Env, Hono, MiddlewareHandler } from './honoTypes';
import type { SentryHonoMiddlewareOptions } from './types';
export interface HonoIntegrationOptions extends SentryHonoMiddlewareOptions {
}
/**
 * Manually instruments a Hono app and returns the Sentry request/response middleware to register
 * first: `app.use(honoMiddleware(app))`.
 *
 * Only needed when neither the Sentry runtime hook nor the bundler plugin is active — otherwise
 * {@link honoIntegration} does this automatically. Safe to combine with the automatic instrumentation
 * (request handling is deduplicated per request, `applyPatches` is idempotent). `Sentry.init(...)`
 * must still be called separately.
 */
export declare function honoMiddleware<E extends Env>(app: Hono<E>, options?: HonoIntegrationOptions): MiddlewareHandler;
/**
 * Automatically instruments Hono applications for Sentry tracing.
 *
 * Hooks Hono's per-request internals (the `Context` constructor and `app.request`) via the
 * orchestrion diagnostics channel — so instrumentation happens per request, never at module scope,
 * which is what lets it work on Cloudflare Workers with no manual middleware. Enabled by default in
 * the Node, Bun, Deno and Cloudflare SDKs; requires the Sentry runtime hook or bundler plugin.
 *
 * Registering `@sentry/hono`'s `sentry()` middleware manually alongside it is safe — request handling
 * is deduplicated per request.
 */
export declare const honoIntegration: (options?: HonoIntegrationOptions | undefined) => import("@sentry/core").Integration & {
    name: "Hono";
};
//# sourceMappingURL=honoIntegration.d.ts.map