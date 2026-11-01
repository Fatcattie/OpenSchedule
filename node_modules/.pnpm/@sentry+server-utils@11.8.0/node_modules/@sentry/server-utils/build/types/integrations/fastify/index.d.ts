import type { FastifyReply, FastifyRequest } from './types';
/**
 * Options for the Fastify integration.
 *
 * `shouldHandleError` - Callback method deciding whether error should be captured and sent to Sentry
 *
 * @example
 *
 * ```javascript
 * Sentry.init({
 *   integrations: [
 *     Sentry.fastifyIntegration({
 *       shouldHandleError(_error, _request, reply) {
 *         return reply.statusCode >= 500;
 *       },
 *     });
 *   },
 * });
 * ```
 *
 */
interface FastifyIntegrationOptions {
    /**
     * Callback method deciding whether error should be captured and sent to Sentry
     * @param error Captured Fastify error
     * @param request Fastify request (or any object containing at least method, routeOptions.url, and routerPath)
     * @param reply Fastify reply (or any object containing at least statusCode)
     */
    shouldHandleError: (error: Error, request: FastifyRequest, reply: FastifyReply) => boolean;
}
/**
 * Adds Sentry tracing instrumentation for [Fastify](https://fastify.dev/).
 * This integration supports Fastify v3.21.0-v6.
 *
 * For more information, see the [fastify documentation](https://docs.sentry.io/platforms/javascript/guides/fastify/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *   integrations: [Sentry.fastifyIntegration()],
 * })
 * ```
 */
export declare const fastifyIntegration: (args_0?: Partial<FastifyIntegrationOptions> | undefined) => import("@sentry/core").Integration & {
    name: "Fastify";
};
/**
 * No-op kept so existing `setupFastifyErrorHandler(app)` calls keep working.
 * `fastifyIntegration` captures errors on its own.
 *
 * @deprecated Remove this call. To filter errors, set `shouldHandleError` on `fastifyIntegration` instead.
 */
export declare function setupFastifyErrorHandler(_fastify: unknown): void;
export {};
//# sourceMappingURL=index.d.ts.map