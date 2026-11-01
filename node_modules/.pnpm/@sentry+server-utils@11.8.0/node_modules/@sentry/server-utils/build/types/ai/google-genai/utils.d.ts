import type { Span } from '@sentry/core';
export type ContentListUnion = Content | Content[] | PartListUnion;
export type ContentUnion = Content | PartUnion[] | PartUnion;
export type Content = {
    parts?: Part[];
    role?: string;
};
export type PartUnion = Part | string;
export type Part = Record<string, unknown> & {
    inlineData?: {
        data?: string;
        displayName?: string;
        mimeType?: string;
    };
    text?: string;
};
export type PartListUnion = PartUnion[] | PartUnion;
/**
 * A message part as described in https://develop.sentry.dev/sdk/telemetry/traces/modules/ai-agents/.
 * Parts Sentry cannot type are dropped when the message is rendered, so Google's own `Part` shape
 * (`{ text }`, `{ functionCall }`, ...) has to be translated into this one.
 */
export type MessagePart = Record<string, unknown> & {
    type: string;
};
export type Message = {
    role: string;
    parts: MessagePart[];
};
/**
 * Binary payloads are reported by media type only: `inlineData.data` is base64 bytes, which the
 * conventions require to be dropped rather than recorded.
 */
export declare function partToMessagePart(part: unknown): MessagePart | undefined;
/**
 * Bare parts are collected into one message rather than one message each: `[{ text }, { inlineData }]`
 * is a single multimodal turn in Google's API, not two turns.
 */
export declare function contentUnionToMessages(content: ContentListUnion, role?: string): Message[];
/** Collect the message parts of every candidate in a response. */
export declare function candidatesToMessageParts(candidates: unknown): MessagePart[];
/**
 * Set alongside the deprecated `gen_ai.response.text` / `gen_ai.response.tool_calls`: Relay migrates
 * those into `gen_ai.output.messages`, but the tool-calls half of that migration is lossy, so a turn
 * that only calls a tool would otherwise render an empty Output.
 */
export declare function setOutputMessagesAttribute(span: Span, parts: MessagePart[]): void;
/** Flatten a `ContentUnion` instruction into the plain text `gen_ai.system_instructions` expects. */
export declare function systemInstructionToText(systemInstruction: unknown): string | undefined;
//# sourceMappingURL=utils.d.ts.map