/**
 * Diagnostics-channel-based mongoose integration.
 *
 * Reproduces the vendored `@opentelemetry/instrumentation-mongoose` span
 * shape (legacy db/net semantic conventions, `mongoose.<Model>.<op>` names,
 * build-time span parenting) via the `orchestrion:mongoose:*`
 * diagnostics_channels injected into mongoose `< 9.7` by Sentry's
 * code transform. For mongoose `>= 9.7` it also drives the native
 * diagnostics_channel subscription, so this single integration covers every
 * supported version once it replaces the OTel one.
 */
export declare const mongooseIntegration: () => import("@sentry/core").Integration & {
    name: "Mongoose";
};
//# sourceMappingURL=index.d.ts.map