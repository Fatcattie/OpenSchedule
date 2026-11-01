import type { RedisCacheOptions } from './redis-cache';
export interface RedisIntegrationOptions extends RedisCacheOptions {
}
/**
 * Adds Sentry tracing instrumentation for the [redis](https://www.npmjs.com/package/redis) and
 * [ioredis](https://www.npmjs.com/package/ioredis) libraries.
 *
 * A single integration covers every client version: `redis` v2-v3, node-redis v4/v5 (`@redis/client`)
 * and ioredis `<5.11.0` via injected channels, and node-redis `>=5.12.0` / ioredis `>=5.11.0` via
 * their native `diagnostics_channel`. Captures single commands, `connect`, and multi/pipeline batches,
 * plus cache spans for keys matching the configured `cachePrefixes`.
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.redisIntegration()],
 * });
 * ```
 */
export declare const redisIntegration: (options?: RedisIntegrationOptions | undefined) => import("@sentry/core").Integration & {
    name: "Redis";
};
//# sourceMappingURL=index.d.ts.map