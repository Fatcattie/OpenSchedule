/**
 * Infers whether a Hono route entry is a middleware (rather than a route handler).
 *
 * Hono has no "isMiddleware" flag, so we rely on arity: middleware is `(context, next)` (arity >= 2)
 * while route handlers are `(context)` (arity < 2). `onError`-wrapped sub-app handlers are unwrapped
 * first so we check the original handler's arity, not the wrapper's `(c, next)` signature.
 * https://github.com/honojs/hono/blob/97c6fe1f12298c715eb7b2da65b4b6e0d81682bb/src/utils/handler.ts#L8
 *
 * This is only one signal — callers that must classify inline middleware sharing a method+path with
 * their handler (e.g. `wrapSubAppMiddleware`) additionally need positional information.
 */
export declare function isMiddleware(handler: unknown): boolean;
//# sourceMappingURL=isMiddleware.d.ts.map