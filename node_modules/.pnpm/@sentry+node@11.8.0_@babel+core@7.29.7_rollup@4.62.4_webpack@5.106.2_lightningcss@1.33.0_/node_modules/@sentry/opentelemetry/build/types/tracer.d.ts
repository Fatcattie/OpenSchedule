import type { Context, Span as OpenTelemetrySpan, SpanOptions, Tracer } from '@opentelemetry/api';
export declare class SentryTracer implements Tracer {
    /** @inheritdoc */
    startSpan(name: string, options?: SpanOptions, ctx?: Context): OpenTelemetrySpan;
    /** @inheritdoc */
    startActiveSpan<F extends (span: OpenTelemetrySpan) => unknown>(name: string, fn: F): ReturnType<F>;
    startActiveSpan<F extends (span: OpenTelemetrySpan) => unknown>(name: string, options: SpanOptions, fn: F): ReturnType<F>;
    startActiveSpan<F extends (span: OpenTelemetrySpan) => unknown>(name: string, options: SpanOptions, ctx: Context, fn: F): ReturnType<F>;
    /**
     * Whether a span started with these arguments gets a parent. Mirrors the parent lookup in `startSpan`
     * plus core's fallback to the scope's active span, which is what parents the span on runtimes without an
     * OTel context manager.
     */
    private _hasParentSpan;
    private _startSentrySpan;
    private _createNonRecordingSpan;
}
//# sourceMappingURL=tracer.d.ts.map