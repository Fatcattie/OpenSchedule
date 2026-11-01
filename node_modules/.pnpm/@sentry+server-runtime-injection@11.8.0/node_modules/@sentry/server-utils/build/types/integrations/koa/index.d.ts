export interface KoaIntegrationOptions {
    /** Ignore layers of the specified types (`'middleware'` and/or `'router'`). */
    ignoreLayersType?: Array<'middleware' | 'router'>;
}
/**
 * Diagnostics-channel-based koa integration. Subscribes to the
 * `orchestrion:koa:use` channel injected into `Application.prototype.use` and
 * wraps each registered middleware/router layer in a span-creating proxy.
 * Requires the Sentry runtime hook or bundler plugin.
 */
export declare const koaIntegration: (options?: KoaIntegrationOptions | undefined) => import("@sentry/core").Integration & {
    name: "Koa";
};
//# sourceMappingURL=index.d.ts.map