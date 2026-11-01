import type { Context } from './honoTypes';
/**
 * Resolves the route path of the matched handler for the transaction name.
 *
 * Picking the handler (not just `routePath`) avoids two failure modes: a catch-all middleware
 * registered after the handlers (`routePath(c, -1)` would return just `/*`), and a middleware that
 * short-circuits before the handler runs (`routePath(c)` would return the middleware's path).
 */
export declare function resolveRouteName(context: Context): string;
//# sourceMappingURL=resolveRouteName.d.ts.map