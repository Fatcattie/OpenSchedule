Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const diagnosticsChannel = require('../../utils/diagnosticsChannel.js');
const core = require('@sentry/core');
const channels = require('../../orchestrion/channels.js');
const kafkajs = require('../../orchestrion/config/kafkajs.js');
const instrumentation = require('../../orchestrion/instrumentation.js');
const consumer = require('./consumer.js');
const spans = require('./spans.js');

const INTEGRATION_NAME = "Kafka";
function subscribeToProducer() {
  const channel = diagnosticsChannel.tracingChannel(channels.CHANNELS.KAFKAJS_SEND_BATCH);
  const subscribers = {
    start(ctx) {
      const spans$1 = [];
      (ctx.arguments[0]?.topicMessages ?? []).forEach((topicMessage) => {
        topicMessage.messages.forEach((message) => {
          spans$1.push(spans.startProducerSpan(topicMessage.topic, message));
        });
      });
      ctx._sentrySpans = spans$1;
    },
    error(ctx) {
      if (ctx._sentrySpans) {
        spans.applyErrorToSpans(ctx._sentrySpans, ctx.error);
      }
    },
    asyncEnd(ctx) {
      ctx._sentrySpans?.forEach((span) => span.end());
    }
  };
  channel.subscribe(subscribers);
}
function subscribeToConsumer() {
  const channel = diagnosticsChannel.tracingChannel(channels.CHANNELS.KAFKAJS_CONSUMER_RUN);
  const subscribers = {
    start(ctx) {
      const config = ctx.arguments[0];
      if (!config || typeof config !== "object") {
        return;
      }
      if (typeof config.eachMessage === "function" && !consumer.isWrappedConsumerCallback(config.eachMessage)) {
        config.eachMessage = consumer.wrapEachMessage(config.eachMessage);
      }
      if (typeof config.eachBatch === "function" && !consumer.isWrappedConsumerCallback(config.eachBatch)) {
        config.eachBatch = consumer.wrapEachBatch(config.eachBatch);
      }
    }
  };
  channel.subscribe(subscribers);
}
const _kafkaIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      instrumentation.invokeOrchestrionInstrumentation(client, kafkajs.kafkajsModuleNames, instrumentKafkajs, [], {
        requiresTracingChannelBinding: false
      });
    }
  };
});
function instrumentKafkajs() {
  subscribeToProducer();
  subscribeToConsumer();
}
const kafkaIntegration = core.defineIntegration(_kafkaIntegration);

exports.kafkaIntegration = kafkaIntegration;
//# sourceMappingURL=index.js.map
