Object.defineProperties(exports, { __esModule: { value: true }, [Symbol.toStringTag]: { value: 'Module' } });

const instrumentationSerdeCXxvJj = require('./instrumentation-serde-C-Xxv-jj.js');
const require$$0 = require('node:path');
const url = require('node:url');
const crypto = require('node:crypto');

//#region src/webpack.ts
var LOADER_PATH = require$$0.resolve(require$$0.dirname(url.fileURLToPath(require('node:url').pathToFileURL(__filename).href)), "..", "cjs", "webpack-loader.cjs");
var DIAGNOSTICS_STATE_KEY = "__codeTransformerWebpackDiagnostics";
/**
* A stable identity for a set of loader options.
*
* Webpack keys a loader by its ruleset ident, not by the contents of its
* options, so with `cache: { type: 'filesystem' }` a changed config would
* otherwise reuse modules built by the previous one. Deriving the ident from
* the options makes the module identifier change with them.
*
* A transform's captured variables are invisible to `toString`, so a factory
* that returns textually identical functions for different inputs still hashes
* the same. `cacheVersion` is the escape hatch for that; binding the transforms
* with `createLoader` is the other, since webpack tracks the loader file's own
* contents.
*/
function loaderIdent(options, cacheVersion) {
	const hash = crypto.createHash("sha256");
	hash.update(JSON.stringify(options.instrumentations));
	hash.update(options.dcModule ?? "");
	hash.update(cacheVersion ?? "");
	for (const name of Object.keys(options.customTransforms ?? {}).sort()) {
		hash.update(name);
		hash.update(String(options.customTransforms?.[name]));
	}
	return `code-transformer-${hash.digest("hex").slice(0, 16)}`;
}
/**
* Asset names of the chunk holding each entry module. Deliberately not
* `entrypoint.getFiles()`, which also lists the initial chunks an entry
* depends on, and not `compilation.getAssets()`, which lists async chunks too.
*/
function entryAssetNames(compilation) {
	const names = /* @__PURE__ */ new Set();
	for (const entrypoint of compilation.entrypoints.values()) {
		const chunk = entrypoint.getEntrypointChunk?.();
		for (const file of chunk?.files ?? []) names.add(file);
	}
	return names;
}
var CodeTransformerWebpackPlugin = class {
	constructor(options) {
		this.options = options;
	}
	apply(compiler) {
		const webpack = compiler.webpack;
		compiler.options.module = compiler.options.module || { rules: [] };
		compiler.options.module.rules = compiler.options.module.rules || [];
		const loaderOptions = {
			instrumentations: instrumentationSerdeCXxvJj.n(this.options.instrumentations),
			...this.options.dcModule ? { dcModule: this.options.dcModule } : {},
			...this.options.customTransforms ? { customTransforms: this.options.customTransforms } : {}
		};
		compiler.options.module.rules.unshift({
			test: /\.(c|m)?jsx?$|\.tsx?$/,
			enforce: "pre",
			use: [{
				loader: this.options.loaderPath ?? LOADER_PATH,
				options: loaderOptions,
				ident: loaderIdent(loaderOptions, this.options.cacheVersion)
			}]
		});
		if (this.options.injectDiagnostics) {
			const ConcatSource = webpack?.sources?.ConcatSource;
			if (ConcatSource && webpack?.Compilation) compiler.hooks.thisCompilation.tap("code-transformer", (compilation) => {
				compilation[DIAGNOSTICS_STATE_KEY] = {
					transformedModules: /* @__PURE__ */ new Set(),
					failedModules: /* @__PURE__ */ new Set()
				};
				compilation.hooks.processAssets.tap({
					name: "code-transformer",
					stage: webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE
				}, () => {
					const state = compilation[DIAGNOSTICS_STATE_KEY];
					if (!state) return;
					const injectCode = this.options.injectDiagnostics?.({
						transformedModules: Array.from(state.transformedModules),
						failedModules: Array.from(state.failedModules)
					});
					if (!injectCode) return;
					for (const assetName of entryAssetNames(compilation)) {
						if (!/\.(js|ts|jsx|tsx|mjs|cjs)(\?[^?]*)?(#[^#]*)?$/.test(assetName)) continue;
						compilation.updateAsset(assetName, (source) => new ConcatSource(injectCode, source));
					}
				});
			});
		}
	}
};
function codeTransformerWebpack(options) {
	return new CodeTransformerWebpackPlugin(options);
}

exports.default = codeTransformerWebpack;
//# sourceMappingURL=webpack.js.map
