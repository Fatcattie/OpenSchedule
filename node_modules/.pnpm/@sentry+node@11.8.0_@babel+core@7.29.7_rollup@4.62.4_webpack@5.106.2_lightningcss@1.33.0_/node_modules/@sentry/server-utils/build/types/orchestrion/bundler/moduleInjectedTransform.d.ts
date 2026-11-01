import type { CustomTransform } from '../apmTypes';
/**
 * Entry-chunk banner that marks "the bundler plugin ran" for
 * `detectOrchestrionSetup()`. Merge-only (`g.bundler = g.bundler || new Set()`)
 * so it can never clobber module names already recorded by an injected snippet
 * that happened to run first; the names themselves arrive per module, when each
 * transformed module is evaluated and its snippet calls
 * `orchestrionModuleInjected`.
 */
export declare const ORCHESTRION_BUNDLER_MARKER_BANNER = ";(function(){var g=globalThis.__SENTRY_ORCHESTRION__=globalThis.__SENTRY_ORCHESTRION__||{};g.bundler=g.bundler||new Set();})();";
/**
 * The unified `customTransforms` every orchestrion bundler plugin (and the
 * webpack/Turbopack loader) applies: an override for orchestrion's built-in
 * `tracingChannelImport` transform, which runs (via `tracingChannelDeclaration`)
 * for every file that gets a channel wrapped — the one hook that reaches every
 * instrumented module without any extra instrumentation configs. It chains the
 * default (which splices the `diagnostics_channel` import and bails when it is
 * already present), then splices the module-injected snippet in after any
 * `'use strict'` directive.
 *
 * Invoked once per wrapped channel, so the `WeakSet` keeps the snippet to one
 * per file. Requires `@apm-js-collab/code-transformer` >= 0.18.1, where
 * built-ins dispatch through the override map and expose the originals on
 * `state.transforms.defaults`.
 *
 * Also carries the registration-only operator, which splices the same snippet
 * without any channel injection — for library versions whose tracing channels
 * are native.
 */
export declare function moduleInjectedTransforms(importSpecifier?: string | (() => string | undefined)): Record<string, CustomTransform>;
//# sourceMappingURL=moduleInjectedTransform.d.ts.map