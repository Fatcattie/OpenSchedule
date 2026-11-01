/**
 * Diagnostics-channel-based `dataloader` integration.
 *
 * Subscribes to the `orchestrion:dataloader:*` diagnostics_channels that Sentry's code
 * transform injects into `dataloader`'s constructor and prototype methods. Requires the Sentry
 * runtime hook or bundler plugin to be active.
 */
export declare const dataloaderIntegration: () => import("@sentry/core").Integration & {
    name: "Dataloader";
};
//# sourceMappingURL=dataloader.d.ts.map