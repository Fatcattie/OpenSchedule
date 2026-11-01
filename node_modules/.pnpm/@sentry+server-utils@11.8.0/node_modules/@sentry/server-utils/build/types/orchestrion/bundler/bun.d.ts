import type { PluginOptions } from './options';
type UnknownPlugin = any;
/**
 * Sentry orchestrion code-transform plugin for Bun's bundler (`bun build`), exposed to users via the
 * `@sentry/bun/plugin` subpath (which re-exports this as `sentryBunPlugin`).
 *
 * This is BUILD-ONLY. Runtime instrumentation (`bun run`) is intentionally not offered: a module
 * returned by a runtime `onLoad` plugin in Bun loses its CommonJS named exports. When
 * https://github.com/oven-sh/bun/pull/31770 lands, we can revisit. Until then, Bun apps must bundle
 * to get build-time instrumentation; in dev (`bun run`) there is simply no instrumentation, which is
 * clearer than partial/inconsistent coverage.
 *
 * The plugin injects `diagnostics_channel.tracingChannel` calls into the instrumented libraries as
 * `bun build` bundles them — plus, via the module-injected transform, the snippet that records each
 * module on `globalThis.__SENTRY_ORCHESTRION__` when it is evaluated — and injects the marker banner
 * so `bundler` is set (to an empty `Set`) from boot, which gates the SDK's channel-integration setup
 * at `init()`.
 */
export declare function sentryOrchestrionPlugin(options?: PluginOptions): UnknownPlugin;
export {};
//# sourceMappingURL=bun.d.ts.map