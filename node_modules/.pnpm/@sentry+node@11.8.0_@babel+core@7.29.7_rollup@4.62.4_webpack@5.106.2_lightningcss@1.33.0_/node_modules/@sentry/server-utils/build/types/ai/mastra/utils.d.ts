import type { SpanAttributeValue } from '@sentry/core';
import type { MastraExportedSpan, MastraSpanType, MastraUsageStats } from './types';
export interface AttributeRecordingOptions {
    recordInputs: boolean;
    recordOutputs: boolean;
}
export type SpanAttributes = Record<string, SpanAttributeValue | undefined>;
export declare function isExportedSpanType(spanType: MastraSpanType): boolean;
export declare function getOperation(spanType: MastraSpanType): {
    op: string;
    operationName: string;
} | undefined;
/**
 * `{operation} {identifier}` per the gen_ai name templates. Mastra's own span name is never used.
 * https://getsentry.github.io/sentry-conventions/names/
 */
export declare function getSpanName(span: MastraExportedSpan): string;
export declare function getUsageAttributes(usage: MastraUsageStats | undefined): SpanAttributes;
/** Sum usage across generations. `setAttributes(undefined)` would drop the previous total. */
export declare function mergeUsageAttributes(existing: SpanAttributes, incoming: SpanAttributes): SpanAttributes;
/** Convention attributes only. Called on start and end — Mastra fills fields progressively. */
export declare function getSpanAttributes(span: MastraExportedSpan, options: AttributeRecordingOptions): SpanAttributes;
//# sourceMappingURL=utils.d.ts.map