import type { HapiServer, HapiShouldHandleError } from './hapi-types';
/**
 * Attach a Sentry error listener to a Hapi server's shared event emitter.
 *
 * The listener sets the isolation scope's transaction name from the errored
 * route and captures the error. It is attached once per server: hapi shares one
 * event emitter (`core.events`) across the root server and every plugin clone,
 * so a single listener covers all requests.
 *
 * Idempotent — the emitter carries the handler state, so auto-registration (via
 * the `start` / `initialize` channels) and any explicit `setupHapiErrorHandler`
 * call never stack up multiple listeners.
 *
 * `shouldHandleError` gates which errors are captured (defaults to
 * {@link defaultShouldHandleError}). When omitted, a previously installed
 * predicate is left untouched; when provided, it overrides whatever was set
 * before — so the integration's configured predicate wins over a prior
 * default-valued attach, regardless of ordering.
 */
export declare function attachHapiErrorHandler(server: HapiServer, shouldHandleError?: HapiShouldHandleError): void;
//# sourceMappingURL=hapi-error-handler.d.ts.map