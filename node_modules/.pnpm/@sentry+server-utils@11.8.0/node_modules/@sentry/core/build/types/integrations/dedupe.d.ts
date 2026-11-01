import type { Event } from '../types/event';
/**
 * Drops an error or message event if it is equal to the previous error or message event.
 * Two events are equal if they have the same message (or the same exception type and value),
 * the same stack trace and the same fingerprint.
 *
 * A repeated `captureException` of the same error object is dropped by the client, also without
 * this integration (see `checkOrSetAlreadyCaught`).
 */
export declare const dedupeIntegration: () => import("..").Integration & {
    name: "Dedupe";
};
/** only exported for tests. */
export declare function _shouldDropEvent(currentEvent: Event, previousEvent?: Event): boolean;
//# sourceMappingURL=dedupe.d.ts.map