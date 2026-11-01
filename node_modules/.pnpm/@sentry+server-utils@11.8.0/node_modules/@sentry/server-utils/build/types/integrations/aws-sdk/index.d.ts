/**
 * Diagnostics-channel-based aws-sdk (v3) integration.
 *
 * Subscribes to the `orchestrion:@smithy/smithy-client:send` (and equivalent) diagnostics_channel
 * Sentry's code transform injects into the AWS SDK's smithy `Client.prototype.send`, emitting
 * spans identical to the OTel `@opentelemetry/instrumentation-aws-sdk` integration. Requires the
 * Sentry runtime hook or bundler plugin.
 */
export declare const awsIntegration: () => import("@sentry/core").Integration & {
    name: "Aws";
};
//# sourceMappingURL=index.d.ts.map