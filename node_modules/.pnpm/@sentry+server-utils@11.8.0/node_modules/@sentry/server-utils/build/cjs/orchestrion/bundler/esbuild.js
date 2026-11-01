Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const esbuild = require('../../vendored/@apm-js-collab/code-transformer-bundler-plugins/dist/esm/esbuild.js');
const core = require('@sentry/core');
const index = require('../config/index.js');
const options = require('./options.js');
const resolve = require('./resolve.js');

function matchesEsbuildExternal(entry, moduleName) {
  if (entry.includes("*")) {
    return new RegExp(`^${entry.split("*").map(core.escapeStringForRegex).join(".*")}$`).test(moduleName);
  }
  return options.externalEntryMatchesModule(entry, moduleName);
}
function sentryOrchestrionPlugin(options$1 = {}) {
  if (options$1.buildTimeInstrumentation === false) {
    return { name: "sentry-orchestrion-disabled", setup: () => void 0 };
  }
  const plugin = esbuild.default(options.orchestrionTransformOptions(options$1));
  const moduleNames = index.instrumentedModuleNames(options$1.instrumentations);
  const setup = plugin.setup;
  return {
    ...plugin,
    setup(build) {
      const external = build.initialOptions.external || [];
      const externalizedModules = moduleNames.filter(
        (name) => external.some((entry) => matchesEsbuildExternal(entry, name))
      );
      if (externalizedModules.length > 0) {
        build.onStart(() => ({ warnings: [{ text: options.externalizedModulesWarning(externalizedModules) }] }));
      }
      build.onResolve({ filter: resolve.SNIPPET_IMPORT_SPECIFIER_FILTER }, async (args) => {
        if (args.pluginData === "sentry-orchestrion-resolving") {
          return null;
        }
        const result = await build.resolve(args.path, {
          resolveDir: args.resolveDir,
          importer: args.importer,
          kind: args.kind,
          pluginData: "sentry-orchestrion-resolving"
        });
        if (result.errors.length === 0) {
          return result;
        }
        const fallback = resolve.resolveOrchestrionRuntimeRequest(args.path);
        return fallback ? { path: fallback, errors: [] } : null;
      });
      return setup(build);
    }
  };
}

exports.sentryOrchestrionPlugin = sentryOrchestrionPlugin;
//# sourceMappingURL=esbuild.js.map
