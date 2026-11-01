export declare const GROQ_INTEGRATION_NAME: 'Groq';
/**
 * Instruments the `groq-sdk` client (chat completions and embeddings). Groq speaks the OpenAI wire format,
 * so this reuses the openai span/streaming logic; see `createOpenAiCompatibleIntegration`. Requires the
 * Sentry runtime hook or bundler plugin so the diagnostics channels get injected into `groq-sdk`.
 */
export declare const groqIntegration: (options?: import("../ai/core/utils").GenAiOptions | undefined) => import("@sentry/core").Integration & {
    name: "Groq";
};
//# sourceMappingURL=groq.d.ts.map