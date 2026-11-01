import type { DataCollection, ResolvedDataCollection } from '../../types/datacollection';
/**
 * Resolves the effective `DataCollection` configuration from client options.
 *
 * Precedence:
 * 1. Spec defaults
 * 2. Fields explicitly set in `dataCollection`
 */
export declare function resolveDataCollectionOptions(options: {
    dataCollection?: DataCollection;
}): ResolvedDataCollection;
//# sourceMappingURL=resolveDataCollectionOptions.d.ts.map