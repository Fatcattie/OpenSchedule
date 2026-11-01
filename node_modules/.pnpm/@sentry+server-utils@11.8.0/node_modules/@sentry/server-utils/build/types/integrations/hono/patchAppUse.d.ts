import type { Env, Hono } from './honoTypes';
/**
 * Patches `app.use` (instance own property) on a Hono instance to instrument middleware at registration time.
 *
 * Must be per-instance because `use` is a class field, not a prototype method.
 * Idempotent.
 */
export declare function patchAppUse<E extends Env>(app: Hono<E>): void;
/**
 * Patches HTTP method class fields to instrument inline middleware at registration time.
 *
 * For `app.get('/path', mw1, mw2, handler)`, all handlers except the last are middleware and get wrapped with spans.
 * The final handler (the route handler) is already covered by the root http.server transaction.
 */
export declare function patchHttpMethodHandlers<E extends Env>(app: Hono<E>): void;
//# sourceMappingURL=patchAppUse.d.ts.map