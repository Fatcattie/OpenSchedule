import type { ExpressIntegrationOptions } from './types';
/**
 * Diagnostics-channel-based Express integration.
 *
 * Subscribes to the `orchestrion:express:handle` (Express v4) and
 * `orchestrion:router:handle` (Express v5, via the `router` package)
 * diagnostics_channels that Sentry's code transform injects into the
 * routing layer's request handler (`Layer.prototype.handle_request` /
 * `handleRequest`). One span is opened per layer invocation — producing the
 * same spans as the OTel Express instrumentation.
 *
 * Requires the Sentry runtime hook or bundler plugin to be active.
 */
export declare const expressIntegration: (options?: ExpressIntegrationOptions | undefined) => import("@sentry/core").Integration & {
    name: "Express";
};
//# sourceMappingURL=index.d.ts.map