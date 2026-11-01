import type { ExpressRequest, ExpressResponse, MiddlewareError } from './types';
type ExpressErrorMiddleware = (error: MiddlewareError, request: ExpressRequest, res: ExpressResponse, next: (error: MiddlewareError) => void) => void;
/**
 * An Express-compatible error handler, used by {@link setupExpressErrorHandler}.
 *
 * @deprecated `expressIntegration()` now captures errors automatically. This export is deprecated and
 * will be removed in the next major version. Migrate to the `expressIntegration` to filter with `shouldHandleError`.
 */
export declare function expressErrorHandler(): ExpressErrorMiddleware;
/**
 * Add an Express error handler to capture errors to Sentry.
 *
 * The error handler must be before any other middleware and after all controllers.
 *
 * @param app The Express instance
 *
 * @deprecated `expressIntegration()` now captures errors automatically, so calling this error handler is no longer
 * necessary. To customize which errors are captured, pass `shouldHandleError` to `expressIntegration()`.
 * This export is deprecated and will be removed in the next major version.
 */
export declare function setupExpressErrorHandler(app: {
    use: (middleware: any) => unknown;
}): void;
export {};
//# sourceMappingURL=error-handler.d.ts.map