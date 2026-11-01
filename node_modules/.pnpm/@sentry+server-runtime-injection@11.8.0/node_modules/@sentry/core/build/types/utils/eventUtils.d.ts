import type { Event, EventHint } from '../types/event';
export declare function isInternalException(hint: EventHint): boolean;
/**
 * Get a list of possible event messages from a Sentry event.
 */
export declare function getPossibleEventMessages(event: Event): string[];
//# sourceMappingURL=eventUtils.d.ts.map