import type { BaseChatModel } from '../langchain/types';
import type { CompiledGraph, LangGraphOptions } from './types';
/**
 * Instruments StateGraph's compile method to wrap the returned compiled graph's invoke() with a
 * `gen_ai.invoke_agent` span.
 */
export declare function instrumentStateGraphCompile(originalCompile: (...args: unknown[]) => CompiledGraph, rawOptions: LangGraphOptions): (...args: unknown[]) => CompiledGraph;
/**
 * Instruments CompiledGraph's invoke method to create spans for agent invocation
 *
 * Creates a `gen_ai.invoke_agent` span when invoke() is called
 */
export declare function instrumentCompiledGraphInvoke(originalInvoke: (...args: unknown[]) => Promise<unknown>, graphInstance: CompiledGraph, compileOptions: Record<string, unknown>, options: LangGraphOptions, llm?: BaseChatModel | null, sentryCallbackHandler?: unknown): (...args: unknown[]) => Promise<unknown>;
/**
 * Instruments createReactAgent to create invoke_agent and execute_tool spans.
 */
export declare function instrumentCreateReactAgent(originalCreateReactAgent: (...args: unknown[]) => CompiledGraph, options?: LangGraphOptions): (...args: unknown[]) => CompiledGraph;
/**
 * Directly instruments a StateGraph instance to add tracing spans
 *
 * This function can be used to manually instrument LangGraph StateGraph instances
 * in environments where automatic instrumentation is not available or desired.
 *
 * @param stateGraph - The StateGraph instance to instrument
 * @param options - Optional configuration for recording inputs/outputs
 *
 * @example
 * ```typescript
 * import { instrumentStateGraph } from '@sentry/cloudflare';
 * import { StateGraph } from '@langchain/langgraph';
 *
 * const graph = new StateGraph(MessagesAnnotation)
 *   .addNode('agent', mockLlm)
 *   .addEdge(START, 'agent')
 *   .addEdge('agent', END);
 *
 * instrumentStateGraph(graph, { recordInputs: true, recordOutputs: true });
 * const compiled = graph.compile({ name: 'my_agent' });
 * ```
 */
export declare function instrumentStateGraph<T extends {
    compile: (...args: any[]) => any;
}>(stateGraph: T, options?: LangGraphOptions): T;
//# sourceMappingURL=index.d.ts.map