/**
 * Shared post-processing for transaction events produced by server span instrumentation.
 *
 * Node's `httpServerSpansIntegration` and Deno's `denoHttpIntegration` both create their
 * server spans outside of the OTel SDK span exporter, so neither gets the exporter's
 * status code handling for free. Both run this from their `processEvent` hook instead.
 */
import type { Event } from '../../types/event';
/**
 * Status codes for which server transactions are dropped unless `ignoreStatusCodes` says otherwise.
 *
 * 300 and 304 are possibly valid status codes we do not want to filter, hence the split ranges.
 */
export declare const DEFAULT_IGNORE_STATUS_CODES: (number | [number, number])[];
/**
 * If the given status code should be filtered for the given list of status codes/ranges.
 */
export declare function shouldFilterStatusCode(statusCode: number, dropForStatusCodes: (number | [number, number])[]): boolean;
/**
 * Drop transaction events whose HTTP status code matches `ignoreStatusCodes`, and surface the
 * status as the top-level `response` context on the ones that are kept.
 *
 * Pass `spanOrigin` to only act on transactions produced by a specific instrumentation, so that
 * an integration owning this option does not filter transactions created by a different one.
 * When omitted, every transaction carrying an HTTP status code is considered.
 *
 * Returns `null` when the event should be dropped, otherwise the (possibly updated) event.
 */
export declare function processHttpServerTransactionEvent(event: Event, ignoreStatusCodes: (number | [number, number])[], spanOrigin?: string): Event | null;
//# sourceMappingURL=server-transaction-event.d.ts.map