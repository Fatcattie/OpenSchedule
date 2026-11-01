import type { SpanAttributes } from '@sentry/core';
interface RedisConnection {
    host?: unknown;
    port?: unknown;
}
/**
 * The conventions attributes that name a redis command span, and the name itself when span
 * streaming is enabled (`undefined` otherwise, leaving the caller's existing name in place).
 *
 * `db.query.text` carries the key and its arguments, so it cannot name a streamed span. Redis has
 * no collection to pair the operation with, so the name is
 * `{db.operation.name} {server.address}:{server.port}`, falling back to `{db.system.name}` when the
 * client was configured without a host. `FCALL` names a redis function, which the conventions model
 * as a stored procedure and rank ahead of the connection.
 *
 * `db.namespace` is deliberately not a target: for redis it is the numeric database index, which
 * says nothing about what the command did.
 */
export declare function getRedisQueryNaming(command: string, args: ReadonlyArray<unknown>, connection: RedisConnection): {
    streamedName: string | undefined;
    attributes: SpanAttributes;
};
export {};
//# sourceMappingURL=redis-span-name.d.ts.map