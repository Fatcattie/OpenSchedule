import { tracingChannel } from '../../utils/diagnosticsChannel.js';
import { defineIntegration } from '@sentry/core';
import { CHANNELS } from '../../orchestrion/channels.js';
import { kafkajsModuleNames } from '../../orchestrion/config/kafkajs.js';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation.js';
import { isWrappedConsumerCallback, wrapEachMessage, wrapEachBatch } from './consumer.js';
import { applyErrorToSpans, startProducerSpan } from './spans.js';

const INTEGRATION_NAME = "Kafka";
function subscribeToProducer() {
  const channel = tracingChannel(CHANNELS.KAFKAJS_SEND_BATCH);
  const subscribers = {
    start(ctx) {
      const spans = [];
      (ctx.arguments[0]?.topicMessages ?? []).forEach((topicMessage) => {
        topicMessage.messages.forEach((message) => {
          spans.push(startProducerSpan(topicMessage.topic, message));
        });
      });
      ctx._sentrySpans = spans;
    },
    error(ctx) {
      if (ctx._sentrySpans) {
        applyErrorToSpans(ctx._sentrySpans, ctx.error);
      }
    },
    asyncEnd(ctx) {
      ctx._sentrySpans?.forEach((span) => span.end());
    }
  };
  channel.subscribe(subscribers);
}
function subscribeToConsumer() {
  const channel = tracingChannel(CHANNELS.KAFKAJS_CONSUMER_RUN);
  const subscribers = {
    start(ctx) {
      const config = ctx.arguments[0];
      if (!config || typeof config !== "object") {
        return;
      }
      if (typeof config.eachMessage === "function" && !isWrappedConsumerCallback(config.eachMessage)) {
        config.eachMessage = wrapEachMessage(config.eachMessage);
      }
      if (typeof config.eachBatch === "function" && !isWrappedConsumerCallback(config.eachBatch)) {
        config.eachBatch = wrapEachBatch(config.eachBatch);
      }
    }
  };
  channel.subscribe(subscribers);
}
const _kafkaIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, kafkajsModuleNames, instrumentKafkajs, [], {
        requiresTracingChannelBinding: false
      });
    }
  };
});
function instrumentKafkajs() {
  subscribeToProducer();
  subscribeToConsumer();
}
const kafkaIntegration = defineIntegration(_kafkaIntegration);

export { kafkaIntegration };
//# sourceMappingURL=index.js.map
