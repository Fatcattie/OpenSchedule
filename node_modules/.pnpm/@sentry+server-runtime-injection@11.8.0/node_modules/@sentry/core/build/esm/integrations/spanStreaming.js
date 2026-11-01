import { DEBUG_BUILD } from '../debug-build.js';
import { defineIntegration } from '../integration.js';
import { captureSpan } from '../tracing/spans/captureSpan.js';
import { hasSpanStreamingEnabled } from '../tracing/spans/hasSpanStreamingEnabled.js';
import { SpanBuffer } from '../tracing/spans/spanBuffer.js';
import { debug } from '../utils/debug-logger.js';
import { spanIsSampled } from '../utils/spanUtils.js';
import { safeUnref } from '../utils/timer.js';

const INTEGRATION_NAME = "SpanStreaming";
const spanStreamingIntegration = defineIntegration((options = {}) => {
  const flushOnSegmentEnd = options.flushOnSegmentEnd ?? true;
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      if (!hasSpanStreamingEnabled(client)) {
        DEBUG_BUILD && debug.log(`[${INTEGRATION_NAME}] \`traceLifecycle\` is "static", skipping setup.`);
        return;
      }
      const buffer = new SpanBuffer(client);
      client.on("afterSpanEnd", (span) => {
        if (!spanIsSampled(span)) {
          return;
        }
        buffer.add(captureSpan(span, client));
      });
      client.on("flushTraceSpans", (traceId) => {
        buffer.flush(traceId);
      });
      if (flushOnSegmentEnd) {
        client.on("afterSegmentSpanEnd", (segmentSpan) => {
          const traceId = segmentSpan.spanContext().traceId;
          safeUnref(
            setTimeout(() => {
              buffer.flush(traceId);
            }, 500)
          );
        });
      }
    }
  };
});

export { INTEGRATION_NAME, spanStreamingIntegration };
//# sourceMappingURL=spanStreaming.js.map
