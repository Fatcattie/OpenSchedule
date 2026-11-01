import type { Event, EventHint } from './types/event';
import type { EventProcessor } from './types/eventprocessor';
type EventProcessorDropReason = 'event_processor' | 'callback_error';
/**
 * Process an array of event processors, returning the processed event (or `null` if the event was dropped).
 */
export declare function notifyEventProcessors(processors: EventProcessor[], event: Event | null, hint: EventHint, index?: number, onDrop?: (reason: EventProcessorDropReason) => void): PromiseLike<Event | null>;
export {};
//# sourceMappingURL=eventProcessors.d.ts.map