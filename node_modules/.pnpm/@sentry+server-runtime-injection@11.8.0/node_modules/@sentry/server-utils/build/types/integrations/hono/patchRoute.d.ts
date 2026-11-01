import type { Hono, HonoRoute } from './honoTypes';
export type { HonoRoute };
type HonoAny = Hono<any>;
export type RouteHookHandle = {
    activate: () => void;
    getPendingSubApps: () => Set<HonoAny>;
};
type HonoBaseProto = {
    route?: (path: string, app: HonoAny) => HonoAny;
    __sentryRouteHook__?: RouteHookHandle;
};
/**
 * Installs a hook on `HonoBase.prototype.route` to intercept sub-app mounting.
 *
 * `honoBaseProto` is `HonoBase.prototype`, where `route` is defined — one level above the concrete
 * subclass. Callers derive it from a live app instance (`Object.getPrototypeOf(Object.getPrototypeOf(app))`)
 * or from the `Hono` class (`Object.getPrototypeOf(Hono.prototype)`), so the instrumentation never
 * imports `hono` itself.
 *
 * Returns a handle with `activate()` and `getPendingSubApps()`.
 * Idempotent: subsequent calls return the same handle
 */
export declare function installRouteHookOnPrototype(honoBaseProto: HonoBaseProto): RouteHookHandle;
/**
 * Identifies middleware handlers in a sub-app's flat routes array and wraps them in spans.
 *
 * Heuristics (since Hono has no "isMiddleware" flag):
 * 1. Position: `app.get('/path', mw, handler)` produces entries with the same method+path.
 *    All but the LAST are middleware (they call `next()`).
 * 2. Arity (# of params) for method 'ALL': `.use()` handlers always have 2+ params (context, next),
 *    while `.all()` route handlers typically have 1 (`context` only).
 *    See: https://github.com/honojs/hono/blob/18fe604c8cefc2628240651b1af219692e1918c1/src/hono-base.ts#L156-L168
 */
export declare function wrapSubAppMiddleware(routes: HonoRoute[]): void;
//# sourceMappingURL=patchRoute.d.ts.map