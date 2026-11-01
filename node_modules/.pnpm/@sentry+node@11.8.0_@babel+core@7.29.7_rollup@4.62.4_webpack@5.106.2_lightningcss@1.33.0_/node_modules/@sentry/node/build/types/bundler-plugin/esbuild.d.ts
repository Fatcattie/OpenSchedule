import type { SentryEsbuildPluginOptions as SentryEsbuildPluginOptionsBase } from '@sentry/bundler-plugins/esbuild';
import type { InstrumentationConfig } from '@sentry/server-utils';
import type { EsbuildPlugin } from '@sentry/server-utils/orchestrion/esbuild';
export type SentryEsbuildPluginOptions = SentryEsbuildPluginOptionsBase & {
    /**
     * @ignore This is for internal use only when this plugin is consumed by a framework SDK
     */
    instrumentations?: InstrumentationConfig[];
    /**
     * Automatic instrumentation of server-side dependencies at build time.
     *
     * Set to `false` to turn it off.
     *
     * @default true
     */
    buildTimeInstrumentation?: boolean;
};
/**
 * esbuild plugin that bundles the Sentry esbuild bundler plugin (source maps,
 * release injection, …) together with the code transformer
 * (build-time `diagnostics_channel` instrumentation for Node libraries).
 *
 * It is a drop-in replacement for `@sentry/bundler-plugins/esbuild` and accepts
 * the same options.
 * @example
 * ```ts
 * // build.mjs
 * import { sentryEsbuildPlugin } from '@sentry/node/esbuild';
 * await esbuild.build({ plugins: [sentryEsbuildPlugin({ org: '…', project: '…' })] });
 * ```
 */
export declare function sentryEsbuildPlugin(options?: SentryEsbuildPluginOptions): EsbuildPlugin;
//# sourceMappingURL=esbuild.d.ts.map