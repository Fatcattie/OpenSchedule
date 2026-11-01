Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const attributes = require('@sentry/conventions/attributes');

class KinesisServiceExtension {
  requestPreSpanHook(request) {
    const streamName = request.commandInput?.StreamName;
    const spanAttributes = {};
    if (streamName) {
      spanAttributes[attributes._AWS_KINESIS_STREAM_NAME] = streamName;
    }
    return {
      spanAttributes
    };
  }
}

exports.KinesisServiceExtension = KinesisServiceExtension;
//# sourceMappingURL=kinesis.js.map
