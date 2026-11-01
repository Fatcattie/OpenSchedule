import type { Integration } from '@sentry/core';
import type { OpenAiOptions } from '../ai/openai/types';
/**
 * Describes an OpenAI-compatible provider whose SDK mirrors the openai wire format (Groq, Together, ...),
 * so the span building, streaming and response parsing can all be reused from `ai/openai`.
 */
export interface OpenAiCompatibleProvider {
    /** Integration name; also the key used to skip double-wrapping when another provider drives the SDK. */
    integrationName: string;
    /** Value reported on `gen_ai.provider.name`. */
    providerName: string;
    /** Span origin, `auto.ai.<provider>`. */
    origin: string;
    /** The instrumented `module.name`s (from the orchestrion config's `getModuleNames`). */
    moduleNames: string[];
    /** The fully-qualified orchestrion channels this provider publishes to. */
    channels: {
        chat: string;
        embeddings: string;
    };
}
/**
 * Builds a diagnostics-channel integration for an OpenAI-compatible provider SDK. It subscribes to the
 * `orchestrion:<module>:{chat,embeddings}` channels injected into the SDK's `create` methods, so it
 * requires the Sentry runtime hook or bundler plugin. Everything below the channel — request/response
 * attributes and streaming — is shared with the openai integration; only the provider name and origin
 * differ.
 */
export declare function createOpenAiCompatibleIntegration<T extends OpenAiCompatibleProvider>(provider: T): (options?: OpenAiOptions) => Integration & {
    name: T['integrationName'];
};
//# sourceMappingURL=openai-compatible.d.ts.map