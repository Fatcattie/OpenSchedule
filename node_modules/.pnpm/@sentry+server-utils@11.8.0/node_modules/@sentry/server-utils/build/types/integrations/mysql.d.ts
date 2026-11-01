/**
 * Diagnostics-channel-based mysql integration.
 *
 * Subscribes to the `orchestrion:mysql:query` diagnostics_channel that
 * Sentry's code transform injects into `mysql/lib/Connection.js`'s
 * `Connection.prototype.query`. Requires the Sentry runtime hook or
 * bundler plugin to be active.
 */
export declare const mysqlIntegration: () => import("@sentry/core").Integration & {
    name: "Mysql";
};
//# sourceMappingURL=mysql.d.ts.map