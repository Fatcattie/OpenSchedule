import type { Span } from '@sentry/core';
import type { MistralOptions } from './types';
/**
 * Extract request attributes from method arguments.
 *
 * `streaming` comes from the called method, not the request: v2 streams only through the dedicated
 * `*.stream` methods, and their `stream` request field is optional, so a params-derived value would
 * be missing on most streaming calls.
 */
export declare function extractRequestAttributes(args: unknown[], operationName: string, recordInputs: boolean, streaming: boolean): Record<string, unknown>;
/**
 * Record AI request inputs on the span, if recording is enabled.
 */
export declare function addRequestAttributes(span: Span, params: Record<string, unknown>, operationName: string): void;
/**
 * Instrument a Mistral client with Sentry tracing.
 * Can be used across Node.js, Cloudflare Workers, and Vercel Edge.
 */
export declare function instrumentMistralAiClient<T extends object>(client: T, options?: MistralOptions): T;
//# sourceMappingURL=index.d.ts.map