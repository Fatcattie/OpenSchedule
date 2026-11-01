/**
 * Diagnostics-channel-based kafkajs integration.
 *
 * Subscribes to the `orchestrion:kafkajs:*` diagnostics_channels that Sentry's code transform
 * injects into `kafkajs`'s `producer/messageProducer.js` (`sendBatch`) and `consumer/index.js` (`run`).
 * Requires the Sentry runtime hook or bundler plugin to be active.
 *
 * Known limitation vs. the OTel integration it replaces: the wrapping producer-`transaction` span is
 * not emitted (the transformer can't replace `transaction()`'s return value to patch commit/abort).
 * Transactional `send`/`sendBatch` calls still produce producer spans, since they route through the
 * same instrumented `sendBatch`.
 */
export declare const kafkaIntegration: () => import("@sentry/core").Integration & {
    name: "Kafka";
};
//# sourceMappingURL=index.d.ts.map