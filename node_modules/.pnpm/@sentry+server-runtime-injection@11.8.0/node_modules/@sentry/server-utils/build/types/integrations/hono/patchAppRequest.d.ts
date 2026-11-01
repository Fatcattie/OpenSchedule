import type { Env, Hono } from './honoTypes';
/** Whether the instance `app.request` Proxy is currently opening an internal-request span. */
export declare function isInternalRequestSpanActive(): boolean;
/**
 * Derive the span-name path from an `app.request()` argument, mirroring Hono's own handling so the
 * name matches the path actually dispatched, with the query/hash stripped so they can't leak into
 * span names or inflate cardinality.
 *
 * Hono treats an absolute `http(s)://` input as a full URL and everything else as a path under
 * `http://localhost` (see `hono-base`'s `request`). We prepend that same fixed host rather than
 * resolving the string as a URL reference: resolution rewrites protocol-relative inputs
 * (`//example.com/foo` → host `example.com`, dropping the segment Hono keeps in the path) and throws
 * on inputs Hono accepts (`//`, `http:`). This runs before the underlying dispatch, so it must never
 * throw — the `catch` is a final guard against any remaining malformed input.
 */
export declare function extractPathname(input: unknown): string;
/**
 * Patches `app.request()` on a Hono instance so that each internal dispatch
 * is traced as an `http.server` span — child of whatever span is active at
 * the call site.
 *
 * `.request()` is a class field (arrow function), so this must run per-instance.
 * Idempotent: safe to call multiple times on the same instance.
 */
export declare function patchAppRequest<E extends Env>(app: Hono<E>): void;
//# sourceMappingURL=patchAppRequest.d.ts.map