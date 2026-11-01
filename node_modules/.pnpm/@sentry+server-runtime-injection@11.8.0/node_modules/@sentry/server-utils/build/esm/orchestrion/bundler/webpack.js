import { SDK_VERSION } from '@sentry/core';
import { SENTRY_INSTRUMENTATIONS, instrumentedModuleNames } from '../config/index.js';
import codeTransformerWebpack from '../../vendored/@apm-js-collab/code-transformer-bundler-plugins/dist/esm/webpack.js';
import { getOrchestrionLoaderPath, resolveOrchestrionRuntimeRequest, SNIPPET_IMPORT_SPECIFIER } from './resolve.js';
import '../../vendored/@apm-js-collab/code-transformer-bundler-plugins/dist/esm/core-dC9TN3Ev.js';
import { n as serializeInstrumentations$1 } from '../../vendored/@apm-js-collab/code-transformer-bundler-plugins/dist/esm/instrumentation-serde-C-Xxv-jj.js';
import { orchestrionTransformOptions, externalizedModulesWarning, externalEntryMatchesModule } from './options.js';

const serializeInstrumentations = serializeInstrumentations$1;
function getSentryInstrumentations() {
  return SENTRY_INSTRUMENTATIONS;
}
function externalizedWebpackModules(externals, moduleNames) {
  const entries = Array.isArray(externals) ? externals : [externals];
  return moduleNames.filter(
    (name) => entries.some((entry) => {
      if (typeof entry === "string") {
        return externalEntryMatchesModule(entry, name);
      }
      if (entry instanceof RegExp) {
        return entry.test(name);
      }
      if (entry && typeof entry === "object") {
        return name in entry;
      }
      return false;
    })
  );
}
function addOrchestrionResolveAlias(compiler) {
  var _a;
  const resolved = resolveOrchestrionRuntimeRequest(SNIPPET_IMPORT_SPECIFIER);
  if (!resolved) {
    return;
  }
  const resolveOptions = (_a = compiler.options).resolve ?? (_a.resolve = {});
  const alias = resolveOptions.alias;
  if (Array.isArray(alias)) {
    if (!alias.some((entry) => entry.name === SNIPPET_IMPORT_SPECIFIER)) {
      alias.push({ name: SNIPPET_IMPORT_SPECIFIER, alias: resolved, onlyModule: true });
    }
    return;
  }
  const aliasMap = resolveOptions.alias = alias ?? {};
  if (!(`${SNIPPET_IMPORT_SPECIFIER}$` in aliasMap) && !(SNIPPET_IMPORT_SPECIFIER in aliasMap)) {
    aliasMap[`${SNIPPET_IMPORT_SPECIFIER}$`] = resolved;
  }
}
function sentryOrchestrionWebpackPlugin(options = {}) {
  if (options.buildTimeInstrumentation === false) {
    return { apply: () => void 0 };
  }
  const plugin = codeTransformerWebpack({
    ...orchestrionTransformOptions(options),
    // The upstream plugin's own loader path points into our `vendored/` tree at
    // a file rollup never emitted; use our bundled loader entrypoint instead
    // (which also bakes in the module-injected transform for Turbopack).
    loaderPath: getOrchestrionLoaderPath(),
    // The loader ident hashes the instrumentations and each custom transform's
    // source text, but not data a transform reads without naming it — our
    // subscriber-definitions table. Key persistent caches on the SDK version so
    // a release changing that table busts them.
    cacheVersion: SDK_VERSION
  });
  const moduleNames = instrumentedModuleNames(options.instrumentations);
  const apply = plugin.apply.bind(plugin);
  plugin.apply = (compiler) => {
    const externalizedModules = externalizedWebpackModules(compiler.options.externals, moduleNames);
    if (externalizedModules.length > 0) {
      compiler.hooks.thisCompilation.tap("SentryOrchestrionExternalsCheck", (compilation) => {
        compilation.warnings.push(new compiler.webpack.WebpackError(externalizedModulesWarning(externalizedModules)));
      });
    }
    addOrchestrionResolveAlias(compiler);
    apply(compiler);
  };
  return plugin;
}

export { getOrchestrionLoaderPath, getSentryInstrumentations, resolveOrchestrionRuntimeRequest, sentryOrchestrionWebpackPlugin, serializeInstrumentations };
//# sourceMappingURL=webpack.js.map
