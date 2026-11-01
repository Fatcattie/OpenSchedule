/**
 * Instruments the `together-ai` client (chat completions and embeddings). Together speaks the OpenAI wire
 * format, so this reuses the openai span/streaming logic; see `createOpenAiCompatibleIntegration`. Requires
 * the Sentry runtime hook or bundler plugin so the diagnostics channels get injected into `together-ai`.
 */
export declare const togetherAIIntegration: (options?: import("../ai/core/utils").GenAiOptions | undefined) => import("@sentry/core").Integration & {
    name: string;
};
//# sourceMappingURL=together-ai.d.ts.map