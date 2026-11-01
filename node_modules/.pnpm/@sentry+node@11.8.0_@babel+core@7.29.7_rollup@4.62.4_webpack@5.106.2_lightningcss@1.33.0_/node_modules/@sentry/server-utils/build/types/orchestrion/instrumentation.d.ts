import type { Client } from '@sentry/core';
declare const INSTRUMENTED: unique symbol;
type InstrumentationFn = ((...args: any[]) => void) & {
    [INSTRUMENTED]?: boolean;
};
/**
 * Run an integration's channel-subscription callback once one of its modules is
 * orchestrion-injected, and never more than once.
 *
 * Channel integrations must NOT subscribe eagerly at `Sentry.init()`: Node caps
 * the number of `diagnostics_channel` channels in use at 1024, and every default
 * channel integration binding several channels up front would burn that budget
 * for modules the app never loads. So we defer:
 *
 * - If a module is already injected, then a bundler transformed and loaded it
 *   (which records it via `orchestrionModuleInjected`), or the runtime hook
 *   injected it before `init()`, so subscribe right away.
 * - Otherwise wait for the `orchestrion.module-injected` event, which fires
 *   when the module is loaded and transformed, before it can publish to its
 *   channels.
 *
 * Bun and Deno have no such channel limit and no reliable per-module injection
 * tracking, so there we just subscribe immediately.
 *
 * `waitForTracingChannelBinding` still wraps the callback: the async-context
 * binding the subscription needs for span parenting may not exist yet.
 *
 * Note: it is possible to register extra event listeners, if the same callback
 * is registered multiple times. However, this is (a) not something that happens
 * normally, and (b) ultimately fine, because it'll only call the callback one
 * time. There'll just be a few no-op client event listeners.
 */
export declare function invokeOrchestrionInstrumentation<Callback extends InstrumentationFn>(client: Client, moduleNames: readonly string[], callback: Callback, args: Parameters<Callback>, { requiresTracingChannelBinding }?: {
    requiresTracingChannelBinding?: boolean;
}): void;
export {};
//# sourceMappingURL=instrumentation.d.ts.map