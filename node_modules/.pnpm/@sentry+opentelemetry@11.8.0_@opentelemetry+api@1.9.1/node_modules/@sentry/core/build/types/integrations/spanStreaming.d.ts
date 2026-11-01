export declare const INTEGRATION_NAME: 'SpanStreaming';
interface SpanStreamingOptions {
    /**
     * When enabled, a trace is flushed shortly after its segment span ends, rather than relying solely
     * on the buffer's timeout/size thresholds or an explicit `flushTraceSpans` emission.
     *
     *
     * @default true
     */
    flushOnSegmentEnd?: boolean;
}
export declare const spanStreamingIntegration: (options?: SpanStreamingOptions | undefined) => import("..").Integration & {
    name: "SpanStreaming";
};
export {};
//# sourceMappingURL=spanStreaming.d.ts.map