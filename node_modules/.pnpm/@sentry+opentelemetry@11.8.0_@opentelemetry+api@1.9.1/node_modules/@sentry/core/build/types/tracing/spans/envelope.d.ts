import type { Client } from '../../client';
import type { DynamicSamplingContext, SpanContainerItem, StreamedSpanEnvelope } from '../../types/envelope';
import type { SerializedStreamedSpan } from '../../types/span';
/**
 * Creates a span v2 span streaming envelope
 */
export declare function createStreamedSpanEnvelope(serializedSpans: Array<SerializedStreamedSpan>, dsc: Partial<DynamicSamplingContext>, client: Client): StreamedSpanEnvelope;
/**
 * Builds a span v2 container envelope item from already-serialized streamed spans.
 */
export declare function createSpanContainerItem(serializedSpans: Array<SerializedStreamedSpan>, client: Client): SpanContainerItem;
//# sourceMappingURL=envelope.d.ts.map