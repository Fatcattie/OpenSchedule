/**
 * Diagnostics-channel-based LangChain integration. Subscribes to the diagnostics_channels
 * injected into `@langchain/core`'s `BaseChatModel` (to inject the Sentry callback handler) and into
 * `@langchain/openai`'s embedding methods, so it requires the Sentry runtime hook or bundler plugin.
 */
export declare const langChainIntegration: (options?: import("../ai/core/utils").GenAiOptions | undefined) => import("@sentry/core").Integration & {
    name: "LangChain";
};
//# sourceMappingURL=langchain.d.ts.map