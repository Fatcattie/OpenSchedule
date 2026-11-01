import * as nodeDiagnosticsChannel from 'node:diagnostics_channel';
/** `diagnostics_channel.channel()`, with the returned channel kept referenced on Bun. */
export declare const channel: typeof nodeDiagnosticsChannel.channel;
/** `diagnostics_channel.subscribe()`, on Bun on a channel kept referenced by {@link channel}. */
export declare const subscribe: typeof nodeDiagnosticsChannel.subscribe;
/**
 * `diagnostics_channel.tracingChannel()`, with the returned tracing channel (and so its five
 * channels) kept referenced on Bun when it is created by name. `undefined` where the runtime has
 * no `tracingChannel` (Node < 18.19), like the original export.
 */
export declare const tracingChannel: typeof nodeDiagnosticsChannel.tracingChannel;
//# sourceMappingURL=diagnosticsChannel.d.ts.map