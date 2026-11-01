import type { BaseTransportOptions, Transport } from '@sentry/core';
/** A transport that can be optionally enabled as a later time than it's
 * creation */
export declare function makeOptionallyEnabledNodeTransport(shouldSendTelemetry: Promise<boolean>): (options: BaseTransportOptions) => Transport;
//# sourceMappingURL=transports.d.ts.map