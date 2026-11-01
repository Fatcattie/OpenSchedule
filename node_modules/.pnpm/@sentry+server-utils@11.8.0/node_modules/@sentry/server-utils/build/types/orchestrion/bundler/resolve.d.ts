/**
 * The specifier the module-injected snippet imports from — the
 * `orchestrionModuleInjected` helper and the module's channel-subscriber factory
 * both live on the main `@sentry/server-utils` entry. It is emitted INSIDE
 * transformed `node_modules` files, where a bare specifier can't resolve from
 * the importing package's location under isolated installs (pnpm), so every
 * bundler plugin gives it build-time resolution help.
 */
export declare const SNIPPET_IMPORT_SPECIFIER = "@sentry/server-utils";
/** esbuild `onResolve` filter matching the snippet import specifier exactly. */
export declare const SNIPPET_IMPORT_SPECIFIER_FILTER: RegExp;
/**
 * Absolute path to the code-transform loader (a webpack loader; also usable as a Turbopack loader).
 * Resolved via self-reference to this package's own bundled copy — the `@apm-js-collab` packages
 * are bundled devDependencies and not resolvable on user installs.
 */
export declare function getOrchestrionLoaderPath(): string;
/**
 * Resolves a request for one of the orchestrion runtime packages (`@sentry/server-utils` itself, via
 * self-reference, or its `@apm-js-collab/*` dependencies) to an absolute path, from this package's
 * own on-disk location — where the whole dependency graph always resolves, regardless of the
 * consuming app's install layout. Returns `undefined` when the request can't be resolved.
 *
 * BUILD-TIME resolver only: the path is handed back to the bundler to load and bundle, never
 * emitted into the output. An absolute path in emitted output doesn't survive the build directory
 * being relocated (Vercel, Docker, `output: 'standalone'`), so a consumer that needs one of these
 * packages to stay EXTERNAL must emit a bare specifier instead — see `@sentry/nextjs`'s
 * `externalizeOrchestrionRuntimePackages`.
 *
 * The specific case it covers: the `@sentry/server-utils/orchestrion` import the module-injected
 * snippet places INSIDE transformed `node_modules` files, which a bundler resolving from the
 * importing file's location can't find under isolated installs.
 */
export declare function resolveOrchestrionRuntimeRequest(request: string): string | undefined;
//# sourceMappingURL=resolve.d.ts.map