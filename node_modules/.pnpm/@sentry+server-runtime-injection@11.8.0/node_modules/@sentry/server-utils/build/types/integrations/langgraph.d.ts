/**
 * Diagnostics-channel-based LangGraph integration. Subscribes to the diagnostics_channels
 * injected into `@langchain/langgraph`'s `StateGraph.compile` and `createReactAgent`, so it requires
 * the Sentry runtime hook or bundler plugin.
 */
export declare const langGraphIntegration: (options?: import("../ai/core/utils").GenAiOptions | undefined) => import("@sentry/core").Integration & {
    name: "LangGraph";
};
//# sourceMappingURL=langgraph.d.ts.map