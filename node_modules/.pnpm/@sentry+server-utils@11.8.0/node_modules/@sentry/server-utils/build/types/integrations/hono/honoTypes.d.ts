/**
 * Vendored subset of `hono`'s public types used by the Sentry Hono instrumentation.
 *
 * The instrumentation lives in `@sentry/server-utils`, a dependency of every server SDK — including
 * apps that do not use Hono. We therefore declare no dependency on `hono` at all: not at runtime
 * (the instrumentation never statically imports it; the `Hono` prototype is derived from a live app
 * instance and matched routes are read from the request's own getters), and not at build/type time
 * (these minimal structural types stand in for `hono`'s).
 *
 * ATTENTION: keep these permissive. Values cross the boundary to the `@sentry/hono` SDK, which uses
 * the real `hono` types, so these must stay assignable from them at those call sites.
 */
export interface Env {
    Bindings?: any;
    Variables?: any;
}
export type Next = () => Promise<void>;
export interface HonoRoute {
    method: string;
    path: string;
    handler: (...args: any[]) => any;
}
export interface HonoRequest {
    raw: Request;
    method: string;
    path: string;
    routeIndex: number;
    matchedRoutes: HonoRoute[];
    routePath: string;
    [key: string]: any;
}
export interface Context {
    req: HonoRequest;
    env: unknown;
    error?: Error;
    event: {
        request: Request;
    };
    [key: string]: any;
}
export type MiddlewareHandler = (context: Context, next: Next) => Promise<Response | void>;
export interface Hono<E extends Env = Env> {
    use: (...args: any[]) => Hono<E>;
    request: (...args: any[]) => Response | Promise<Response>;
    routes: HonoRoute[];
    [key: string]: any;
}
export interface ConnInfoRemote {
    address?: string;
    port?: number;
    transport?: string;
    addressType?: string;
}
export type GetConnInfo = (context: any) => {
    remote?: ConnInfoRemote;
};
//# sourceMappingURL=honoTypes.d.ts.map