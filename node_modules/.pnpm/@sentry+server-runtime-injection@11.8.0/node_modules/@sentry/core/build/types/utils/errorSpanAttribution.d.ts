import type { Scope } from '../scope';
import type { Event, EventHint } from '../types/event';
import type { Span } from '../types/span';
/**
 * Remember which span an error escaped, so a later `captureException` can attribute the error to
 * the span that actually failed instead of whichever span happens to be active at capture time.
 *
 * The first span to see the error wins: as an error unwinds through nested spans, the innermost
 * one is the one that failed. Unsampled spans are skipped because they are never sent, so their
 * span id would point at a span that does not exist. Sampling rather than `isRecording()` is what
 * matters here: a span ended before the error escaped it, which is the norm for `startSpanManual`,
 * has stopped recording but is still sent.
 */
export declare function recordEscapedErrorSpan(error: unknown, span: Span): void;
/**
 * Attribute an error event to the span the error escaped, if we recorded one.
 *
 * This only applies within the error's own trace. The stored span id is meaningless in another
 * trace, and the event's dynamic sampling context (which the envelope header is built from) is
 * derived from the root span of the trace the event is already on. Rewriting the trace id here
 * would leave the envelope header and body naming different traces.
 */
export declare function applyEscapedErrorSpanToEvent(event: Event, hint: EventHint, scope: Scope | undefined): void;
//# sourceMappingURL=errorSpanAttribution.d.ts.map