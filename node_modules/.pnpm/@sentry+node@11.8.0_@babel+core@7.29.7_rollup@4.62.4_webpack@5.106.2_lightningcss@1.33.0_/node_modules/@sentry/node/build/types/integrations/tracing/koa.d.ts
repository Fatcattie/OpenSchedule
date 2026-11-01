/**
 * Add a Koa error handler to capture errors to Sentry.
 *
 * @deprecated The error handler is now registered automatically when the Koa app
 * starts (via the orchestrion `koa` instrumentation), so calling this is no
 * longer necessary. It remains a safe, idempotent operation, and is kept for
 * setups where auto-registration is unavailable. This will be removed in a
 * future major version.
 *
 * @param app The Koa app instance
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 * const Koa = require("koa");
 *
 * const app = new Koa();
 *
 * // Add your routes, etc.
 *
 * app.listen(3000);
 * ```
 */
export declare const setupKoaErrorHandler: (app: {
    on: (event: 'error', listener: (...args: any[]) => void) => unknown;
}) => void;
//# sourceMappingURL=koa.d.ts.map