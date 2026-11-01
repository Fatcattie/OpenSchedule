/**
 * Mark an Express request as having had its error handled by the channel-based `expressIntegration()`,
 * so the deprecated `expressErrorHandler` middleware defers to that decision.
 */
export declare function markExpressErrorHandled(request: unknown): void;
/**
 * Whether the channel-based `expressIntegration()` has already handled an error on this Express request.
 */
export declare function isExpressErrorHandled(request: unknown): boolean;
//# sourceMappingURL=error-handled.d.ts.map