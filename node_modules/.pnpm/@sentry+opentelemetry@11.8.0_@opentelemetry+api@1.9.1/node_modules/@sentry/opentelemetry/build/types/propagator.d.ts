import type { Context, TextMapGetter, TextMapPropagator, TextMapSetter } from '@opentelemetry/api';
/**
 * A minimal OpenTelemetry `TextMapPropagator` that injects and extracts Sentry trace data.
 *
 * This propagator only supports injecting/extracting from current context, for simplicity sake.
 * It will bail and do nothing if using a different context.
 */
export declare class SentryPropagator implements TextMapPropagator {
    /** @inheritDoc */
    inject(ctx: Context, carrier: unknown, setter: TextMapSetter): void;
    /** @inheritDoc */
    extract(ctx: Context, carrier: unknown, getter: TextMapGetter): Context;
    /** @inheritDoc */
    fields(): string[];
}
//# sourceMappingURL=propagator.d.ts.map