import type { Span } from '@sentry/core';
/** The subset of mongoose's `Collection` that the legacy span shape reads. */
export interface MongooseLegacyCollection {
    name?: string;
    conn?: {
        name?: string;
        user?: string;
        host?: string;
        port?: number;
    };
}
export interface StartMongooseLegacySpanOptions {
    collection: MongooseLegacyCollection | undefined;
    modelName: string | undefined;
    operation: string;
    origin: string;
    parentSpan?: Span;
}
/**
 * Start a mongoose client span reproducing the vendored
 * `@opentelemetry/instrumentation-mongoose` span shape, on the stable
 * conventions. `db.system.name` deliberately deviates from what the OTel
 * instrumentation emitted: mongoose is an ODM, the database system is mongodb.
 *
 * Shared by the vendored OTel/IITM instrumentation (`@sentry/node`) and the
 * orchestrion channel subscriber so the two emit an identical span shape,
 * differing only by `origin`.
 */
export declare function startMongooseLegacySpan({ collection, modelName, operation, origin, parentSpan, }: StartMongooseLegacySpanOptions): Span;
//# sourceMappingURL=mongoose-legacy-span.d.ts.map