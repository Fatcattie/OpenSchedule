/**
 * Diagnostics-channel-based mongodb integration.
 *
 * Reproduces the vendored `@opentelemetry/instrumentation-mongodb` span shape
 * (legacy db/net semantic conventions, `mongodb.<op>` names, scrubbed
 * `db.statement`) via the `orchestrion:mongodb:*` diagnostics_channels
 * injected by Sentry's code transform.
 */
export declare const mongoIntegration: () => import("@sentry/core").Integration & {
    name: "Mongo";
};
//# sourceMappingURL=index.d.ts.map