/**
 * Connects Sentry to an existing OpenTelemetry setup.
 *
 * Everything Sentry sends that carries trace information (errors, logs, metrics and check-ins) is
 * attached to the OpenTelemetry span that is active when it happens, so it shows up on the same
 * trace as the spans your OpenTelemetry SDK exports. Outgoing request propagation is left to your
 * OpenTelemetry propagator.
 *
 * An active Sentry span still takes precedence, so this only changes what happens when Sentry has no
 * span of its own, which is the usual setup when OpenTelemetry owns tracing.
 *
 * This does not export any spans. Configure your own span exporter and point it at Sentry using
 * {@link getOtlpTracesEndpoint}.
 */
export declare const openTelemetryIntegration: () => import("@sentry/core").Integration & {
    name: "OpenTelemetry";
};
/**
 * Builds the URL and auth headers for Sentry's OTLP traces endpoint, to configure an
 * `OTLPTraceExporter` with.
 *
 * Returns `undefined` if the DSN cannot be parsed.
 *
 * @example
 *
 * ```javascript
 * import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
 * import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
 * import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
 *
 * const provider = new NodeTracerProvider({
 *   spanProcessors: [
 *     new BatchSpanProcessor(new OTLPTraceExporter(Sentry.getOtlpTracesEndpoint('__DSN__'))),
 *   ],
 * });
 *
 * provider.register();
 *
 * Sentry.init({
 *   dsn: '__DSN__',
 *   integrations: [Sentry.openTelemetryIntegration()],
 * });
 * ```
 */
export declare function getOtlpTracesEndpoint(dsn: string): {
    url: string;
    headers: Record<string, string>;
} | undefined;
//# sourceMappingURL=opentelemetry.d.ts.map