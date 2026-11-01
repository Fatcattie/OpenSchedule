import type { Span, SpanStatusType } from '@sentry/core';
import type { AnthropicAiResponse } from './types';
/**
 * Set the input messages attribute, extracting system instructions into their own attribute.
 */
export declare function setMessagesAttribute(span: Span, messages: unknown): void;
/**
 * Map an Anthropic API error type to a SpanStatusType value.
 * @see https://docs.anthropic.com/en/api/errors#error-shapes
 */
export declare function mapAnthropicErrorToStatusMessage(errorType: string | undefined): SpanStatusType;
/**
 * Capture error information from the response
 * @see https://docs.anthropic.com/en/api/errors#error-shapes
 */
export declare function handleResponseError(span: Span, response: AnthropicAiResponse): void;
/**
 * Include the system prompt in the messages list, if available
 */
export declare function messagesFromParams(params: Record<string, unknown>): unknown[];
//# sourceMappingURL=utils.d.ts.map