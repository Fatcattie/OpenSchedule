export type SpanKindNumber = 0 | 1 | 2 | 3 | 4;
export type SpanKind = 'server' | 'client' | 'producer' | 'consumer';
/**
 * Resolve the string name of a span kind value (e.g. `1` → `'SERVER'`), mirroring the reverse
 * mapping of OpenTelemetry's `SpanKind` enum. Used for the `otel.kind` span attribute, so SDK
 * code doesn't need to import `@opentelemetry/api` just for that reverse lookup.
 */
export declare function spanKindToName(kind: number): SpanKind | undefined;
//# sourceMappingURL=spanKind.d.ts.map