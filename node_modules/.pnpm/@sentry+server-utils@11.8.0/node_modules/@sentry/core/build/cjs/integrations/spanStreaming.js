Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const debugBuild = require('../debug-build.js');
const integration = require('../integration.js');
const captureSpan = require('../tracing/spans/captureSpan.js');
const hasSpanStreamingEnabled = require('../tracing/spans/hasSpanStreamingEnabled.js');
const spanBuffer = require('../tracing/spans/spanBuffer.js');
const debugLogger = require('../utils/debug-logger.js');
const spanUtils = require('../utils/spanUtils.js');
const timer = require('../utils/timer.js');

const INTEGRATION_NAME = "SpanStreaming";
const spanStreamingIntegration = integration.defineIntegration((options = {}) => {
  const flushOnSegmentEnd = options.flushOnSegmentEnd ?? true;
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      if (!hasSpanStreamingEnabled.hasSpanStreamingEnabled(client)) {
        debugBuild.DEBUG_BUILD && debugLogger.debug.log(`[${INTEGRATION_NAME}] \`traceLifecycle\` is "static", skipping setup.`);
        return;
      }
      const buffer = new spanBuffer.SpanBuffer(client);
      client.on("afterSpanEnd", (span) => {
        if (!spanUtils.spanIsSampled(span)) {
          return;
        }
        buffer.add(captureSpan.captureSpan(span, client));
      });
      client.on("flushTraceSpans", (traceId) => {
        buffer.flush(traceId);
      });
      if (flushOnSegmentEnd) {
        client.on("afterSegmentSpanEnd", (segmentSpan) => {
          const traceId = segmentSpan.spanContext().traceId;
          timer.safeUnref(
            setTimeout(() => {
              buffer.flush(traceId);
            }, 500)
          );
        });
      }
    }
  };
});

exports.INTEGRATION_NAME = INTEGRATION_NAME;
exports.spanStreamingIntegration = spanStreamingIntegration;
//# sourceMappingURL=spanStreaming.js.map
