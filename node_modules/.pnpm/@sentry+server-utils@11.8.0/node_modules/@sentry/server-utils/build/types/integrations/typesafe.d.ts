import type { GenAiOptions } from '../ai/core/utils';
/**
 * Diagnostics-channel-based integration for the TypeSafe SDK (`@typesafe-ai/sdk` >= 0.5.0 < 1).
 * Subscribes to the `orchestrion:@typesafe-ai/sdk:system-one` channel injected into
 * `TypeSafeClient.systemOne`, so it requires the Sentry runtime hook or bundler plugin.
 */
export declare const typesafeIntegration: (options?: GenAiOptions | undefined) => import("@sentry/core").Integration & {
    name: "TypeSafe";
};
//# sourceMappingURL=typesafe.d.ts.map