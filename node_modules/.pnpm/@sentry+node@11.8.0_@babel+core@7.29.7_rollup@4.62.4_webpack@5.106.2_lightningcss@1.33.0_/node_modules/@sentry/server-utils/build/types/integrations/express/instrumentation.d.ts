import type * as diagnosticsChannel from 'node:diagnostics_channel';
import type { ExpressIntegrationOptions, ExpressShouldHandleError, HandleChannelContext } from './types';
export declare function instrumentExpress(options: ExpressIntegrationOptions, tracingChannel: typeof diagnosticsChannel.tracingChannel): void;
/**
 * Capture an error surfaced on a layer's `handle_request` channel — the throw
 * site, which runs before any user error-handling middleware.
 *
 * Each request's error is handled exactly once: the same error surfaces on every
 * parent layer's `error` event as it bubbles, and a user may also still call the
 * deprecated `setupExpressErrorHandler`. We mark the request the first time we
 * see it, so later layers and that middleware defer to this decision — the
 * integration is the single registered handler and its `shouldHandleError` wins.
 * This deliberately does not rely on `captureException`'s global dedup, which is
 * only set when an error is actually captured and so cannot express a
 * "deliberately skipped" decision (leaving the deprecated middleware free to
 * capture it and override `shouldHandleError`).
 *
 * `shouldHandleError` is the raw integration option: `false` disables capture
 * entirely, a function customizes the gate, and `undefined` falls back to
 * {@link defaultShouldHandleError}.
 */
export declare function captureLayerError(data: HandleChannelContext, shouldHandleError: ExpressShouldHandleError | undefined): void;
//# sourceMappingURL=instrumentation.d.ts.map