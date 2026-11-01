import type { FastifyReply, FastifyRequest } from './types';
/**
 * Subscribe to the Fastify v5 error diagnostics channel.
 */
export declare function subscribeToFastifyErrorChannel(): void;
/**
 * Handle a Fastify error, and possibly send it to Sentry.
 *
 * On Fastify v5 a route handler error surfaces on both the diagnostics channel
 * and the `onError` hook, so this runs twice for the same request. We mark the
 * request with a non-enumerable symbol once it has been captured, and bail out
 * on subsequent calls, so the same error is only sent once. Errors that reach
 * only one path (e.g. thrown in an `onRequest` hook, or on Fastify v3/v4 which
 * has no channel) are captured once.
 */
export declare function handleFastifyError(request: FastifyRequest, reply: FastifyReply, error: Error): void;
//# sourceMappingURL=errors.d.ts.map