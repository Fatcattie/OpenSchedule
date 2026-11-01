import type { InstrumentationConfig } from '../apmTypes';
export declare const mongooseConfig: InstrumentationConfig[];
export declare const mongooseModuleNames: string[];
export declare const mongooseChannels: {
    readonly MONGOOSE_QUERY_EXEC: 'orchestrion:mongoose:query_exec';
    readonly MONGOOSE_AGGREGATE_EXEC: 'orchestrion:mongoose:aggregate_exec';
    readonly MONGOOSE_MODEL_SAVE: 'orchestrion:mongoose:model_save';
    readonly MONGOOSE_MODEL_INSERT_MANY: 'orchestrion:mongoose:model_insert_many';
    readonly MONGOOSE_MODEL_BULK_WRITE: 'orchestrion:mongoose:model_bulk_write';
    readonly MONGOOSE_MODEL_REMOVE: 'orchestrion:mongoose:model_remove';
    readonly MONGOOSE_MODEL_AGGREGATE: 'orchestrion:mongoose:model_aggregate';
};
/**
 * Fully-qualified names of the context-capture channels, derived from the
 * same method list the transform config uses so the two can't drift. The
 * subscriber subscribes to all of them uniformly to stash the build-time
 * parent span (see `mongooseChannels` for the span-creating channels).
 */
export declare const MONGOOSE_CONTEXT_CAPTURE_CHANNELS: string[];
//# sourceMappingURL=mongoose.d.ts.map