import type { RawAttributes } from '../../attributes';
import type { Client } from '../../client';
import type { SerializedStreamedSpan, Span, SpanJSON, StreamedSpanJSON } from '../../types/span';
export type SerializedStreamedSpanWithSegmentSpan = SerializedStreamedSpan & {
    _segmentSpan: Span;
};
/**
 * Captures a span and returns a JSON representation to be enqueued for sending.
 *
 * IMPORTANT: This function converts the span to JSON immediately to avoid writing
 * to an already-ended OTel span instance (which is blocked by the OTel Span class).
 *
 * @returns the final serialized span with a reference to its segment span. This reference
 * is needed later on to compute the DSC for the span envelope.
 */
export declare function captureSpan(span: Span, client: Client): SerializedStreamedSpanWithSegmentSpan;
/**
 * Safely set attributes on a span JSON.
 * If an attribute already exists, it will not be overwritten.
 */
export declare function safeSetSpanJSONAttributes(spanJSON: StreamedSpanJSON, newAttributes: RawAttributes<Record<string, unknown>>): void;
/**
 * Captures a standalone span whose `beforeSendSpan` callback expects the v1 {@link SpanJSON} format
 * (i.e. the user opted out of span streaming). The span is serialized to v1, the common attributes are
 * applied, the callback runs in its native format, and the result is converted forward to a serialized
 * v2 span. This mirrors how gen_ai spans reach the v2 span path from a static transaction (a plain
 * conversion, no `processSpan` hooks), so there is never a reverse v2 -> v1 conversion.
 *
 * TODO(standalone): remove once the static (transaction) trace lifecycle is dropped.
 */
export declare function captureStandaloneSpanWithStaticCallback(span: Span, client: Client, beforeSendSpan: (span: SpanJSON) => SpanJSON): SerializedStreamedSpan;
//# sourceMappingURL=captureSpan.d.ts.map