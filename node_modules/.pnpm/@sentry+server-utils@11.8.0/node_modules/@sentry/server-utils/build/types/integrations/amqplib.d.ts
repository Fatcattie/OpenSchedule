/**
 * The default exchange has no name and binds every queue under a key equal to the queue's own name, so
 * a routing key used with it is the queue name. On a named exchange the routing key is per-message
 * (`order.created.12345`), so only the exchange is used.
 *
 * @see https://www.rabbitmq.com/docs/exchanges#default-exchange
 * @internal Exported for tests; every scenario publishes through `sendToQueue`.
 */
export declare function resolveDestination(exchange: string | undefined, routingKey: string | undefined): string | undefined;
/**
 * Diagnostics-channel-based `amqplib` integration.
 *
 * Subscribes to the `orchestrion:amqplib:*` diagnostics_channels that Sentry's code transform
 * injects into `amqplib`'s channel/connection methods. Requires the Sentry runtime hook or
 * bundler plugin to be active.
 */
export declare const amqplibIntegration: () => import("@sentry/core").Integration & {
    name: "Amqplib";
};
//# sourceMappingURL=amqplib.d.ts.map