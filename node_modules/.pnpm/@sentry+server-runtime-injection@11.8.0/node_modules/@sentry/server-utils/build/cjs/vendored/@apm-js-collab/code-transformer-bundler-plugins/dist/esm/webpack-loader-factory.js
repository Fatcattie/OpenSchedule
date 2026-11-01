Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const instrumentationSerdeCXxvJj = require('./instrumentation-serde-C-Xxv-jj.js');
const index$1 = require('../../../code-transformer/index.js');
const require$$0 = require('node:path');
const fs = require('node:fs');
const index = require('../../../../module-details-from-path/index.js');

//#region src/webpack-loader-factory.ts
var moduleDetailsFromPath$1 = index.default || index;
var DIAGNOSTICS_STATE_KEY = "__codeTransformerWebpackDiagnostics";
/**
* Helper function to get module version from package.json
*/
function getModuleVersion(basedir) {
	try {
		const packageJsonPath = require$$0.join(basedir, "package.json");
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
		if (packageJson.version) return packageJson.version;
	} catch (error) {}
}
function getDiagnosticsState(loaderContext) {
	return loaderContext?._compilation?.[DIAGNOSTICS_STATE_KEY];
}
/**
* Identity keys for transform functions, so that the matcher cache can tell two
* sets of custom transforms apart. Functions have no stable serialization —
* `toString` ignores captured variables — so identity is all we can key on.
*/
var transformIds = /* @__PURE__ */ new WeakMap();
var nextTransformId = 0;
function customTransformsKey(customTransforms) {
	return Object.keys(customTransforms).sort().map((name) => {
		const fn = customTransforms[name];
		let id = transformIds.get(fn);
		if (id === void 0) {
			id = nextTransformId++;
			transformIds.set(fn, id);
		}
		return `${name}:${id}`;
	}).join(",");
}
/**
* Builds a webpack loader that instruments JavaScript code using
* code-transformer.
*
* Use this to wrap the loader in your own package when loader options are not
* a viable channel for custom transforms — under Turbopack, which serializes
* them as JSON, or with worker-based loaders such as `thread-loader`:
*
* ```js
* // my-library/loader.cjs
* const { createLoader } = require('@apm-js-collab/code-transformer-bundler-plugins/webpack-loader-factory');
* module.exports = createLoader({ customTransforms: { injectIntegration } });
* ```
*
* Webpack resolves that module by path, so the transform stays in the loader
* process and only the JSON-serializable `instrumentations` cross into the
* loader options.
*
* The plain `/webpack-loader` export is `createLoader()` with no baked-in
* configuration; the webpack plugin passes `customTransforms` to it directly.
*/
function createLoader(factoryOptions = {}) {
	const matcherCache = /* @__PURE__ */ new Map();
	/**
	* Get or create a matcher instance with caching based on config hash
	*/
	function getMatcher(instrumentations, dcModule, customTransforms) {
		const configHash = JSON.stringify({
			instrumentations: instrumentationSerdeCXxvJj.n(instrumentations),
			dcModule,
			customTransforms: customTransformsKey(customTransforms)
		});
		if (matcherCache.has(configHash)) return matcherCache.get(configHash);
		for (const [hash, matcher] of matcherCache.entries()) if (hash !== configHash) matcherCache.delete(hash);
		const matcher = index$1.codeTransformer.create(instrumentationSerdeCXxvJj.t(instrumentations), dcModule ?? null);
		for (const [name, fn] of Object.entries(customTransforms)) matcher.addTransform(name, fn);
		matcherCache.set(configHash, matcher);
		return matcher;
	}
	return function codeTransformerLoader(code, inputSourceMap) {
		const callback = this.async();
		const options = this.getOptions();
		const resourcePath = this.resourcePath;
		const instrumentations = options.instrumentations ?? factoryOptions.instrumentations;
		const dcModule = options.dcModule ?? factoryOptions.dcModule;
		const customTransforms = {
			...factoryOptions.customTransforms,
			...options.customTransforms
		};
		if (!instrumentations || instrumentations.length === 0) return callback(null, code, inputSourceMap);
		const ext = require$$0.extname(resourcePath);
		let moduleType = ext === ".mjs" || ext === ".ts" || ext === ".tsx" ? "esm" : "unknown";
		if (ext === ".js") moduleType = code.includes("export ") || code.includes("import ") ? "esm" : "cjs";
		else if (ext === ".cjs") moduleType = "cjs";
		const moduleDetails = moduleDetailsFromPath$1(resourcePath);
		if (!moduleDetails) return callback(null, code, inputSourceMap);
		const moduleName = moduleDetails.name;
		const moduleVersion = getModuleVersion(moduleDetails.basedir);
		if (!moduleVersion) return callback(null, code, inputSourceMap);
		const transformer = getMatcher(instrumentations, dcModule, customTransforms).getTransformer(moduleName, moduleVersion, moduleDetails.path);
		if (!transformer) return callback(null, code, inputSourceMap);
		try {
			const result = transformer.transform(code, moduleType, inputSourceMap);
			getDiagnosticsState(this)?.transformedModules.add(transformer.moduleName);
			callback(null, result.code, result.map);
		} catch (error) {
			console.warn(`[code-transformer-loader] Error transforming ${resourcePath}:`, error);
			getDiagnosticsState(this)?.failedModules.add(moduleDetails.name);
			callback(null, code, inputSourceMap);
		}
	};
}

exports.createLoader = createLoader;
//# sourceMappingURL=webpack-loader-factory.js.map
