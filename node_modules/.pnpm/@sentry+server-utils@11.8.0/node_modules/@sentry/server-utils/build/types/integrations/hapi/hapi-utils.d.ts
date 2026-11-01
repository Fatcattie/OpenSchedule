import type { HapiRequest, ServerRequestExtType, ServerRoute } from './hapi-types';
/**
 * Default function deciding whether an error should be sent to Sentry.
 *
 * Captures 5xx errors and any error whose status can't be resolved; skips 3xx
 * and 4xx (client errors / redirects) and 2xx-and-below outliers are captured
 * as they usually signal an unmapped thrown error. Mirrors the defaults used by
 * the other server framework integrations.
 */
export declare function defaultShouldHandleError(error: unknown, request: HapiRequest): boolean;
type SpanAttributes = Record<string, string | undefined>;
interface SpanMetadata {
    attributes: SpanAttributes;
    name: string;
}
/** Build the span name and attributes for a Hapi route. */
export declare const getRouteMetadata: (route: ServerRoute, pluginName?: string) => SpanMetadata;
/** Build the span name and attributes for a Hapi server extension. */
export declare const getExtMetadata: (extPoint: ServerRequestExtType, pluginName?: string, methodName?: string) => SpanMetadata;
/**
 * Wrap the route handler(s) in the live `server.route` arguments array, mutating
 * `args[0]` in place. `args[0]` is either a single route options object or an
 * array of them. Idempotent via the `handlerPatched` marker.
 */
export declare function wrapRouteArguments(args: unknown[], pluginName?: string): void;
/**
 * Wrap the extension method(s) in the live `server.ext` arguments array,
 * mutating `args` in place. Handles the three accepted input shapes:
 * `(eventsArray)`, `(lifecycleEventObject)`, and `(extTypeString, method, options)`.
 * Idempotent via the `handlerPatched` marker.
 */
export declare function wrapExtArguments(args: unknown[], pluginName?: string): void;
export {};
//# sourceMappingURL=hapi-utils.d.ts.map