import type { GenAiOptions } from '../core/utils';
import type { FlueInstrumentation } from './types';
export type FlueOptions = GenAiOptions;
/**
 * Build the object to hand to `instrument()` from `@flue/runtime`.
 *
 * The two callbacks own different halves of the result:
 *
 * - `interceptor` wraps agent execution, so the agent span is *active* for its duration and every
 *   span opened underneath parents correctly.
 * - `observe` opens and closes the turn span, because Flue's `turn_start`/`turn` events are the
 *   only one-to-one signal for a model call and `turn` is what carries usage and cost.
 *
 * Message content, tool arguments and tool results are gated on `recordInputs`/`recordOutputs`,
 * which fall back to the current client's `dataCollection.genAI` settings and are read per event.
 */
export declare function createFlueInstrumentation(options?: FlueOptions): FlueInstrumentation;
//# sourceMappingURL=index.d.ts.map