import type { Env, Hono } from './honoTypes';
/**
 * Hooks `HonoBase.prototype.route` at import time, before `sentry()` runs.
 *
 * Collecting sub-app references early ensures nothing is missed if sub-apps are mounted synchronously
 * before the `sentry()` middleware is registered. The `Hono` class is passed in by the caller (the
 * `@sentry/hono` SDK, where `hono` is a peer dependency) so this module never imports `hono` itself;
 * `HonoBase.prototype` is one level above the class prototype.
 */
export declare function earlyPatchHono(honoClass: {
    prototype: object;
}): void;
/**
 * Instruments a Hono app instance for Sentry tracing in middleware and route handlers.
 *
 * - `use` and `request` are per-instance class fields → must be patched on the instance.
 * - `route` is a prototype method → hooked once globally, covers all instances.
 * - Retroactively instruments sub-apps mounted before `sentry()` was called.
 */
export declare function applyPatches<E extends Env>(app: Hono<E>): void;
/**
 * Applies Sentry's Hono span patches to an app instance.
 *
 * Typed loosely (`object`) so the real `hono` `Hono<E, S, P>` type used by the `@sentry/hono` SDK is
 * accepted without a cast; internally it is treated as the vendored {@link Hono} shape.
 */
export declare function applyHonoPatches(app: object): void;
//# sourceMappingURL=applyPatches.d.ts.map