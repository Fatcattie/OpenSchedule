Object.defineProperties(exports, { __esModule: { value: true }, [Symbol.toStringTag]: { value: 'Module' } });

const coreDC9TN3Ev = require('./core-dC9TN3Ev.js');
const node_fs = require('node:fs');

//#region src/bun.ts
function loaderForPath(path) {
	if (path.endsWith(".tsx")) return "tsx";
	if (path.endsWith(".jsx")) return "jsx";
	if (path.endsWith(".ts") || path.endsWith(".cts") || path.endsWith(".mts")) return "ts";
	return "js";
}
function buildFilter(options) {
	const names = Array.from(new Set(options.instrumentations.map((i) => i.module.name))).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	if (names.length === 0) return /(?!)/;
	const alt = names.join("|");
	return new RegExp(`node_modules[/\\\\](?:${alt})[/\\\\].*\\.(?:cjs|mjs|cts|mts|tsx|jsx|ts|js)$`);
}
function codeTransformerBun(options) {
	const filter = buildFilter(options);
	return {
		name: "code-transformer",
		setup(build) {
			let transformer = coreDC9TN3Ev.r(options);
			const bunBuild = build;
			if (typeof build.onStart === "function") build.onStart(() => {
				transformer = coreDC9TN3Ev.r(options);
			});
			build.onLoad({
				filter,
				namespace: "file"
			}, (args) => {
				const contents = node_fs.readFileSync(args.path, "utf8");
				const result = transformer.transform(contents, args.path);
				const loader = loaderForPath(args.path);
				return {
					contents: result ? result.code : contents,
					loader
				};
			});
			if (!options.injectDiagnostics) return;
			if (typeof bunBuild.onEnd !== "function") {
				console.warn("'injectDiagnostics' is not supported when the plugin is registered at runtime via 'Bun.plugin()' because there is no bundle to inject into. Use it with 'Bun.build()'.");
				return;
			}
			if (!bunBuild.config?.outdir) {
				console.warn("'injectDiagnostics' requires an 'outdir' in the 'Bun.build()' config because in-memory build outputs cannot be modified.");
				return;
			}
			bunBuild.onEnd((result) => {
				if (!result.success) return;
				const injectCode = transformer.getCodeToInject();
				if (!injectCode) return;
				for (const artifact of result.outputs) {
					if (artifact.kind !== "entry-point" || !coreDC9TN3Ev.i(artifact.path)) continue;
					const code = node_fs.readFileSync(artifact.path, "utf8");
					node_fs.writeFileSync(artifact.path, injectCode + code);
				}
			});
		}
	};
}

exports.default = codeTransformerBun;
//# sourceMappingURL=bun.js.map
