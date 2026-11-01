/**
 * Diagnostics-channel-based lru-memoizer integration. Subscribes to
 * `orchestrion:lru-memoizer:load` (injected into `lru-memoizer/lib/async.js`'s
 * `memoizedFunction`). Creates no spans; only re-runs the memoized callback with the
 * caller's scope. Requires the Sentry runtime hook or bundler plugin.
 */
export declare const lruMemoizerIntegration: () => import("@sentry/core").Integration & {
    name: "LruMemoizer";
};
//# sourceMappingURL=lru-memoizer.d.ts.map