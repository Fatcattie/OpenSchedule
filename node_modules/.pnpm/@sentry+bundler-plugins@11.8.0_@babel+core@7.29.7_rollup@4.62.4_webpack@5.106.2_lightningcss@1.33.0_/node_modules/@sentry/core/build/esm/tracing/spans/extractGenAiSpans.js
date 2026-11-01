import { createSpanContainerItem } from './envelope.js';
import { hasSpanStreamingEnabled } from './hasSpanStreamingEnabled.js';
import { spanJsonToSerializedStreamedSpan } from './spanJsonToStreamedSpan.js';

function extractGenAiSpansFromEvent(event, client) {
  if (event.type !== "transaction" || !event.spans?.length || !event.sdkProcessingMetadata?.hasGenAiSpans || hasSpanStreamingEnabled(client)) {
    return void 0;
  }
  const genAiSpans = [];
  const remainingSpans = [];
  for (const span of event.spans) {
    if (span.op?.startsWith("gen_ai.")) {
      genAiSpans.push(spanJsonToSerializedStreamedSpan(span));
    } else {
      remainingSpans.push(span);
    }
  }
  if (genAiSpans.length === 0) {
    return void 0;
  }
  event.spans = remainingSpans;
  return createSpanContainerItem(genAiSpans, client);
}

export { extractGenAiSpansFromEvent };
//# sourceMappingURL=extractGenAiSpans.js.map
