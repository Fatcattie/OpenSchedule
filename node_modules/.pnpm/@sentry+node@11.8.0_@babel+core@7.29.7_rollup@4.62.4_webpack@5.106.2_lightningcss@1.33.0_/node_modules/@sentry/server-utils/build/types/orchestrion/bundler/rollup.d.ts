import type { Plugin } from 'rollup';
export type { Plugin as RollupPlugin } from 'rollup';
import type { PluginOptions } from './options';
/**
 * Structural subset of `@rollup/plugin-commonjs` options, so this package needs no dependency on
 * the plugin for its types.
 */
export interface CommonJSInteropOptions {
    requireReturnsDefault: (id: string) => boolean | 'auto' | 'preferred' | 'namespace';
    ignoreTryCatch: (id: string) => boolean;
}
/**
 * `@rollup/plugin-commonjs` options for builds that bundle CommonJS packages while their
 * dependencies stay external. Builtin `require()`s unwrap to the module (a namespace breaks
 * direct calls) and convert inside `try` blocks (a bare `require` throws in ESM output).
 * Externals keep `'auto'`, which {@link sentryCommonJSInteropPlugin} fixes for Node >= 23.
 */
export declare function commonJSInteropOptions(): CommonJSInteropOptions;
/**
 * Fixes `@rollup/plugin-commonjs`' `'auto'` interop for Node >= 23 by patching the broken
 * namespace check in its helpers module. The patch applies only while the exact broken
 * expression exists, so it retires itself once the plugin is fixed upstream.
 */
export declare function sentryCommonJSInteropPlugin(): Plugin;
/**
 * Rollup plugin that runs the orchestrion code transform on the bundled output.
 *
 * Use when bundling a Node app with Rollup. For unbundled Node processes use the
 * runtime hook instead (`node --import @sentry/node/orchestrion app.js`).
 *
 * @example
 * ```ts
 * // rollup.config.js
 * import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/rollup';
 * export default { plugins: [sentryOrchestrionPlugin()] };
 * ```
 */
export declare function sentryOrchestrionPlugin(options?: PluginOptions): Plugin;
//# sourceMappingURL=rollup.d.ts.map