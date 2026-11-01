import type { MiddlewareError } from './types';
/**
 * Default function deciding whether an error should be sent to Sentry: captures
 * 5xx errors, and treats an error without a resolvable status as a 500. Errors
 * carrying a 3xx/4xx status are skipped (client errors / redirects).
 */
export declare function defaultShouldHandleError(error: MiddlewareError): boolean;
//# sourceMappingURL=utils.d.ts.map