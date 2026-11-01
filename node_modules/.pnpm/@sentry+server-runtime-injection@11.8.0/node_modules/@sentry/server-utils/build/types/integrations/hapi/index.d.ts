import type { HapiShouldHandleError } from './hapi-types';
interface HapiIntegrationOptions {
    /**
     * Callback deciding whether an error should be captured and sent to Sentry.
     *
     * By default, 5xx errors (and errors without a resolvable status) are sent,
     * while 3xx and 4xx errors are not. The hapi request's `response` carries the
     * resolved HTTP status.
     *
     * @example
     *
     * ```javascript
     * Sentry.init({
     *   integrations: [
     *     Sentry.hapiIntegration({
     *       shouldHandleError(_error, request) {
     *         return (request.response?.output?.statusCode ?? request.response?.statusCode ?? 500) >= 500;
     *       },
     *     }),
     *   ],
     * });
     * ```
     */
    shouldHandleError: HapiShouldHandleError;
}
/**
 * Diagnostics-channel-based hapi integration. Subscribes to the
 * `orchestrion:@hapi/hapi:route` / `:ext` channels injected into `@hapi/hapi`'s
 * `lib/server.js`. Requires the Sentry runtime hook or bundler plugin.
 */
export declare const hapiIntegration: (args_0?: Partial<HapiIntegrationOptions> | undefined) => import("@sentry/core").Integration & {
    name: "Hapi";
};
export {};
//# sourceMappingURL=index.d.ts.map