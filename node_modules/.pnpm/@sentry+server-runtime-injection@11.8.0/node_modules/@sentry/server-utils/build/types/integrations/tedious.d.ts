/**
 * Diagnostics-channel-based tedious integration.
 *
 * Subscribes to the `orchestrion:tedious:*` diagnostics_channels that Sentry's code transform
 * injects into tedious's `Connection` request methods (each traced as one db span) and `Connection.connect`
 * (active-database bookkeeping). Requires the Sentry runtime hook or bundler plugin to be active.
 */
export declare const tediousIntegration: () => import("@sentry/core").Integration & {
    name: "Tedious";
};
//# sourceMappingURL=tedious.d.ts.map