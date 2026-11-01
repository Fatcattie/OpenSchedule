import type { CoreOptions as Options } from '../types/options';
import type { TracePropagationTargets } from '../types/tracing';
import type { LRUMap } from './lru';
/**
 * Check if a value matches any of the given `tracePropagationTargets`.
 *
 * The value is usually a URL, but it can be anything a propagation decision is made on, such as a
 * Cloudflare binding name. String targets match as a substring unless `requireExactStringMatch` is set.
 *
 * Matching is case-insensitive: URL normalization (e.g. `new URL()`) lower-cases the origin, so a target
 * written with the same casing as the request (`'myApi.com'`, `/^myApi\.com/`) would otherwise never match.
 */
export declare function matchesTracePropagationTargets(value: string, tracePropagationTargets: TracePropagationTargets, requireExactStringMatch?: boolean): boolean;
/**
 * Check if a given URL should be propagated to or not.
 * If no url is defined, or no trace propagation targets are defined, this will always return `true`.
 * You can also optionally provide a decision map, to cache decisions and avoid repeated regex lookups.
 */
export declare function shouldPropagateTraceForUrl(url: string | undefined, tracePropagationTargets: Options['tracePropagationTargets'], decisionMap?: LRUMap<string, boolean>): boolean;
//# sourceMappingURL=tracePropagationTargets.d.ts.map