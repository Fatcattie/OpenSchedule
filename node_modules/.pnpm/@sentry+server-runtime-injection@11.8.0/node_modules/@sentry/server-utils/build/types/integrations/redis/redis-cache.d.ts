import type { Span, SpanAttributes } from '@sentry/core';
export type RedisCommandArgs = Array<string | Buffer | number | unknown[]>;
export declare const GET_COMMANDS: string[];
export declare const SET_COMMANDS: string[];
export declare const REMOVE_COMMANDS: string[];
/** Options controlling which redis commands are captured as cache spans. */
export interface RedisCacheOptions {
    /**
     * Define cache prefixes for cache keys that should be captured as a cache span.
     *
     * Setting this to, for example, `['user:']` will capture cache keys that start with `user:`.
     */
    cachePrefixes?: string[];
    /**
     * Maximum length of the cache key added to the span description. If the key exceeds this length, it will be truncated.
     *
     * Passing `0` will use the full cache key without truncation.
     *
     * By default, the full cache key is used.
     *
     * Only applies with `traceLifecycle: 'static'`. With span streaming (the default), span names are
     * low cardinality: cache spans are named after the cache operation (e.g. `cache.get`) and the
     * key is only added to the `cache.key` attribute, so there is nothing to truncate.
     */
    maxCacheKeyLength?: number;
}
/** Checks if a given command is in the list of redis commands.
 *  Useful because commands can come in lowercase or uppercase (depending on the library). */
export declare function isInCommands(redisCommands: string[], command: string): boolean;
/** Determine cache operation based on redis statement */
export declare function getCacheOperation(command: string): 'cache.get' | 'cache.put' | 'cache.remove' | undefined;
/** Safely converts a redis key to a string (comma-separated if there are multiple keys) */
export declare function getCacheKeySafely(redisCommand: string, cmdArgs: RedisCommandArgs): string[] | undefined;
/** Determines whether a redis operation should be considered as "cache operation" by checking if a key is prefixed.
 *  We only support certain commands (such as 'set', 'get', 'mget'). */
export declare function shouldConsiderForCache(redisCommand: string, keys: string[], prefixes: string[]): boolean;
/** Calculates size based on the cache response value */
export declare function calculateCacheItemSize(response: unknown): number | undefined;
/**
 * Decides at span-start time whether a redis command is a cache operation (its key matches one of
 * the configured `cachePrefixes`) and returns the span name plus attribute overrides to merge into
 * the db span options, or `undefined` for a plain db span. Callers must spread the returned
 * attributes after their db attributes, so the cache op overrides the db op. Deciding at start time
 * — instead of renaming the db span at response time — makes `ignoreSpans` and span streaming see
 * the same op/name the user sees in the UI.
 *
 * `dbAttributes` are the attributes the caller starts the span with; the network peer is derived
 * from `server.address`/`server.port` in there.
 */
export declare function getRedisCacheAttributes(redisCommand: string, cmdArgs: RedisCommandArgs, dbAttributes: SpanAttributes, options: RedisCacheOptions): {
    name: string;
    attributes: SpanAttributes;
} | undefined;
/**
 * Sets the response-derived cache attributes (`cache.hit`, `cache.item_size`) on a span that was
 * started as a cache span via {@link getRedisCacheAttributes}. A no-op for plain db spans and for
 * `cache.remove` spans — a remove response is a delete-count, not a cached value, so its size is
 * meaningless.
 */
export declare function applyCacheResponseAttributes(span: Span, response: unknown): void;
//# sourceMappingURL=redis-cache.d.ts.map