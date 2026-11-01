Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const envelope = require('./envelope.js');
const hasSpanStreamingEnabled = require('./hasSpanStreamingEnabled.js');
const spanJsonToStreamedSpan = require('./spanJsonToStreamedSpan.js');

function extractGenAiSpansFromEvent(event, client) {
  if (event.type !== "transaction" || !event.spans?.length || !event.sdkProcessingMetadata?.hasGenAiSpans || hasSpanStreamingEnabled.hasSpanStreamingEnabled(client)) {
    return void 0;
  }
  const genAiSpans = [];
  const remainingSpans = [];
  for (const span of event.spans) {
    if (span.op?.startsWith("gen_ai.")) {
      genAiSpans.push(spanJsonToStreamedSpan.spanJsonToSerializedStreamedSpan(span));
    } else {
      remainingSpans.push(span);
    }
  }
  if (genAiSpans.length === 0) {
    return void 0;
  }
  event.spans = remainingSpans;
  return envelope.createSpanContainerItem(genAiSpans, client);
}

exports.extractGenAiSpansFromEvent = extractGenAiSpansFromEvent;
//# sourceMappingURL=extractGenAiSpans.js.map
