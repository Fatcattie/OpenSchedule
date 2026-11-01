import type { Context, GetConnInfo } from './honoTypes';
import { type SentryHonoMiddlewareOptions } from './types';
/**
 * Request handler for Hono framework
 */
export declare function requestHandler(context: Context, getConnInfo?: GetConnInfo): void;
/**
 * Response handler for Hono framework
 */
export declare function responseHandler(context: Context, shouldHandleError?: SentryHonoMiddlewareOptions['shouldHandleError']): void;
/**
 * Captures an unhandled context error, gated by the user's `shouldHandleError` (or the default).
 *
 * Split out from {@link responseHandler} so a deduplicated middleware can still report its own
 * context's error without re-resolving the route name or overwriting request data — e.g. the inner
 * context of an internal `.request()` whose route threw but whose failed response the outer handler
 * swallowed.
 */
export declare function captureContextError(context: Context, shouldHandleError?: SentryHonoMiddlewareOptions['shouldHandleError']): void;
//# sourceMappingURL=middlewareHandlers.d.ts.map