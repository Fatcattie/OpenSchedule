/**
 * Warns when a build option that was removed in v11 is still present in a user's build config.
 *
 * TypeScript already rejects these keys, but meta-framework build configs are frequently plain
 * JavaScript (`next.config.js`, `next.config.mjs`), where a removed option would otherwise be a
 * silent no-op.
 *
 * @param options The user's build options, if any.
 * @param removedKeys The removed option names to check for.
 * @param logWarning Called at most once, with the full warning message. Defaults to `console.warn`,
 * which suits every SDK whose build step has no logger of its own. Pass this only to route the
 * warning through a framework logger (e.g. Astro's).
 *
 * @internal Only meant for Sentry-internal SDK usage.
 * @hidden
 */
export declare function warnOnRemovedBuildOptions(options: object | undefined, removedKeys: string[], logWarning?: (message: string) => void): void;
//# sourceMappingURL=warnOnRemovedBuildOptions.d.ts.map