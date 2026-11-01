import codeTransformerEsbuild from '../../vendored/@apm-js-collab/code-transformer-bundler-plugins/dist/esm/esbuild.js';
import { escapeStringForRegex } from '@sentry/core';
import { instrumentedModuleNames } from '../config/index.js';
import { orchestrionTransformOptions, externalizedModulesWarning, externalEntryMatchesModule } from './options.js';
import { SNIPPET_IMPORT_SPECIFIER_FILTER, resolveOrchestrionRuntimeRequest } from './resolve.js';

function matchesEsbuildExternal(entry, moduleName) {
  if (entry.includes("*")) {
    return new RegExp(`^${entry.split("*").map(escapeStringForRegex).join(".*")}$`).test(moduleName);
  }
  return externalEntryMatchesModule(entry, moduleName);
}
function sentryOrchestrionPlugin(options = {}) {
  if (options.buildTimeInstrumentation === false) {
    return { name: "sentry-orchestrion-disabled", setup: () => void 0 };
  }
  const plugin = codeTransformerEsbuild(orchestrionTransformOptions(options));
  const moduleNames = instrumentedModuleNames(options.instrumentations);
  const setup = plugin.setup;
  return {
    ...plugin,
    setup(build) {
      const external = build.initialOptions.external || [];
      const externalizedModules = moduleNames.filter(
        (name) => external.some((entry) => matchesEsbuildExternal(entry, name))
      );
      if (externalizedModules.length > 0) {
        build.onStart(() => ({ warnings: [{ text: externalizedModulesWarning(externalizedModules) }] }));
      }
      build.onResolve({ filter: SNIPPET_IMPORT_SPECIFIER_FILTER }, async (args) => {
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
        const fallback = resolveOrchestrionRuntimeRequest(args.path);
        return fallback ? { path: fallback, errors: [] } : null;
      });
      return setup(build);
    }
  };
}

export { sentryOrchestrionPlugin };
//# sourceMappingURL=esbuild.js.map
