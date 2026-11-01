import type { Tracer, TracerOptions, TracerProvider } from '@opentelemetry/api';
/**
 * A minimal OpenTelemetry TracerProvider which creates native Sentry spans.
 */
export declare class SentryTracerProvider implements TracerProvider {
    private readonly _tracers;
    /** @inheritdoc */
    getTracer(name: string, version?: string, options?: TracerOptions): Tracer;
    /** Compatibility with SDK tracer providers. */
    forceFlush(): Promise<void>;
    /** Compatibility with SDK tracer providers. */
    shutdown(): Promise<void>;
}
//# sourceMappingURL=tracerProvider.d.ts.map