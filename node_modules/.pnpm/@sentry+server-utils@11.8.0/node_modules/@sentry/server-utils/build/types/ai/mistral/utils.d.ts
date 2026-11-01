import type { Span } from '@sentry/core';
/**
 * Turn a Mistral message content (string or content-chunk array) into a plain string.
 */
export declare function contentToString(content: unknown): string;
/**
 * Build the span name for an instrumented Mistral call. Agent ids and a missing model are left out
 * to keep the name low cardinality.
 */
export declare function getSpanName(operationName: string, attributes: Record<string, unknown>): string;
/**
 * Extract request parameters. Mistral request fields are camelCase.
 */
export declare function extractRequestParameters(params: Record<string, unknown>): Record<string, unknown>;
/**
 * Add response attributes to a span using duck-typing. Mistral responses are camelCase
 * (`choices[].message`, `usage.promptTokens`), matching the SDK's deserialized objects.
 */
export declare function addResponseAttributes(span: Span, result: unknown, recordOutputs?: boolean): void;
//# sourceMappingURL=utils.d.ts.map