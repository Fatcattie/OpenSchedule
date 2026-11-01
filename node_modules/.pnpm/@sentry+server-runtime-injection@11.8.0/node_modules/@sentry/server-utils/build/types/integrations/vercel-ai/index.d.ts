import type { GenAiOptions } from '../../ai/core/utils';
/** Options for the Vercel AI integration. */
export type VercelAiOptions = GenAiOptions;
/**
 * Auto-instrument the `ai` SDK. Supported are:
 * - v7 via native `ai:telemetry` tracing channel
 * - v4, v5 & v6 via the injected `orchestrion:ai:*` channels
 */
export declare const vercelAIIntegration: (options?: GenAiOptions | undefined) => import("@sentry/core").Integration & {
    name: "VercelAI";
};
//# sourceMappingURL=index.d.ts.map