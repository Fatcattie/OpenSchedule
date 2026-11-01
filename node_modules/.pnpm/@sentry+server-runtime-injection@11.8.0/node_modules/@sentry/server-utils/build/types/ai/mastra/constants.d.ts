export declare const MASTRA_INTEGRATION_NAME: 'Mastra';
/** Cap on tracked spans, matching `MAX_TRACKED_PRISMA_SPANS`. Spans that never end would otherwise leak. */
export declare const MAX_TRACKED_MASTRA_SPANS = 1000;
export declare const MASTRA_ORIGIN = "auto.ai.mastra";
/** Not `sentry` — that is the community `@mastra/sentry` exporter name. */
export declare const MASTRA_EXPORTER_NAME = "sentry-sdk";
/** Name used by the community `@mastra/sentry` package. */
export declare const COMMUNITY_MASTRA_SENTRY_EXPORTER_NAME = "sentry";
/**
 * Distinguishes our exporter from the community one. `Symbol.for` so the check still matches if
 * two copies of `@sentry/server-utils` are loaded (`instanceof` would not).
 */
export declare const MASTRA_EXPORTER_BRAND: unique symbol;
/**
 * Only conventional `gen_ai` ops. Unmapped Mastra types (workflow steps, processors, scorers, …)
 * are dropped; their children re-parent onto the nearest mapped ancestor.
 *
 * `op` comes from `@sentry/conventions/op`. `operationName` is a `gen_ai.operation.name` literal —
 * the conventions package has no constants for those.
 */
export declare const SPAN_TYPE_OPS: Readonly<Record<string, {
    op: string;
    operationName: string;
}>>;
export declare const TOOL_SPAN_TYPES: ReadonlySet<string>;
/**
 * `model_inference` is omitted: Mastra nests `model_generation > model_step > model_inference`,
 * and the inference span repeats the generation — mapping both to `gen_ai.chat` duplicates it.
 */
export declare const MODEL_SPAN_TYPES: ReadonlySet<string>;
export declare const AGENT_SPAN_TYPES: ReadonlySet<string>;
//# sourceMappingURL=constants.d.ts.map