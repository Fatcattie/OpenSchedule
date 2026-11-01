/**
 * Diagnostics-channel-based knex integration.
 *
 * Subscribes to the `orchestrion:knex:*` diagnostics_channels that Sentry's code transform
 * injects into knex's `Runner.query` (span) and `Client.queryBuilder`/`schemaBuilder`/`raw` (parent-span
 * bookkeeping). Requires the Sentry runtime hook or bundler plugin to be active.
 */
export declare const knexIntegration: () => import("@sentry/core").Integration & {
    name: "Knex";
};
//# sourceMappingURL=knex.d.ts.map