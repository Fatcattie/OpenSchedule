interface LoaderOptions {
    /** Fixed import specifier for the module-injected snippet. */
    importSpecifier?: string;
    /**
     * Absolute path to the `@sentry/server-utils` module the snippet imports from.
     * When set, the snippet imports a PER-FILE RELATIVE path to it: Turbopack
     * rejects absolute-path imports ("server relative imports are not implemented
     * yet"), and a bare specifier emitted inside a transformed package doesn't
     * resolve from that package's location under isolated installs (pnpm). A
     * relative specifier is resolved from the importing file and consumed entirely
     * at build time. Takes precedence over `importSpecifier`.
     */
    importHelperPath?: string;
}
interface LoaderContext {
    resourcePath: string;
    getOptions: () => LoaderOptions;
}
type LoaderFn = (this: LoaderContext, code: string, inputSourceMap?: unknown) => void;
/**
 * Reads the Sentry-specific options (unknown to the upstream loader, which
 * reads only its own fields), stages the snippet specifier for this file, and
 * delegates to the factory-built loader. `instrumentations` stays a plain
 * per-rule loader option, read by the upstream loader itself.
 */
declare const codeTransformerLoader: LoaderFn;
export default codeTransformerLoader;
//# sourceMappingURL=webpack-loader.d.ts.map