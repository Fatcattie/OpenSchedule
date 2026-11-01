/**
 * Diagnostics-channel-based Anthropic integration. Subscribes to the `orchestrion:@anthropic-ai/sdk:*`
 * diagnostics_channels injected into the SDK's chat (`messages`/`completions`/beta `messages`) and
 * `messages.stream()` methods, so it requires the Sentry runtime hook or bundler plugin.
 */
export declare const anthropicAIIntegration: (options?: import("../ai/core/utils").GenAiOptions | undefined) => import("@sentry/core").Integration & {
    name: "Anthropic_AI";
};
//# sourceMappingURL=anthropic.d.ts.map