import type { SentryBuildPluginManager } from './build-plugin-manager';
import type { Logger } from './logger';
import type { ResolveSourceMapHook, RewriteSourcesHook } from './types';
interface DebugIdUploadPluginOptions {
    sentryBuildPluginManager: SentryBuildPluginManager;
}
export declare function createDebugIdUploadFunction({ sentryBuildPluginManager }: DebugIdUploadPluginOptions): (buildArtifactPaths: string[]) => Promise<void>;
export declare function prepareBundleForDebugIdUpload(bundleFilePath: string, uploadFolder: string, chunkIndex: number, logger: Logger, rewriteSourcesHook: RewriteSourcesHook, resolveSourceMapHook: ResolveSourceMapHook | undefined): Promise<void>;
export type StampedArtifacts = {
    bundleSource: string;
    /** `undefined` when the bundle has no separate source map (i.e. the map is inlined). */
    sourceMapSource: string | undefined;
};
/**
 * Stamps the debug ID injected into `bundleSource` into the bundle (as `//# debugId=` comment) and its
 * source map (as `debug_id`/`debugId` fields).
 *
 * This exists for `sourcemaps.disable: "disable-upload"`: the regular upload path only stamps
 * temporary copies of the artifacts (see `prepareBundleForDebugIdUpload`), so without this the
 * emitted artifacts would carry no debug ID and a later manual upload could not match them.
 * Callers must apply the result inside the bundler's asset pipeline (or, for bundlers without one,
 * before the build resolves) so that integrity hashes computed by later build steps include it.
 *
 * Pass `sourceMapSource: undefined` when the bundle has no separate source map. A bundle with an
 * inlined map still gets the comment, which is all the CLI and Symbolicator read the debug ID from.
 *
 * @returns the stamped artifacts, or `undefined` for bundles without a debug ID, without any source
 * map, or with an unparseable map.
 */
export declare function stampDebugId(bundleSource: string, sourceMapSource: string | undefined): StampedArtifacts | undefined;
/**
 * Stamps the debug ID of an emitted bundle into the bundle and its source map on disk.
 *
 * Used by bundlers that offer no hook to modify assets before they are written (esbuild).
 */
export declare function addDebugIdToEmittedArtifacts(bundleFilePath: string, logger: Logger, resolveSourceMapHook: ResolveSourceMapHook | undefined): Promise<void>;
/**
 * Applies a set of heuristics to find the source map for a particular bundle.
 *
 * @returns the path to the bundle's source map or `undefined` if none could be found.
 */
export declare function determineSourceMapPathFromBundle(bundlePath: string, bundleSource: string, logger: Logger, resolveSourceMapHook: ResolveSourceMapHook | undefined): Promise<string | undefined>;
export declare function defaultRewriteSourcesHook(source: string): string;
export {};
//# sourceMappingURL=debug-id-upload.d.ts.map