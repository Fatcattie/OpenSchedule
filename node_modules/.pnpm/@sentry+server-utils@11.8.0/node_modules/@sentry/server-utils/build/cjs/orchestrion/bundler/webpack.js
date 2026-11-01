Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const index = require('../config/index.js');
const webpack = require('../../vendored/@apm-js-collab/code-transformer-bundler-plugins/dist/esm/webpack.js');
const resolve = require('./resolve.js');
require('../../vendored/@apm-js-collab/code-transformer-bundler-plugins/dist/esm/core-dC9TN3Ev.js');
const instrumentationSerdeCXxvJj = require('../../vendored/@apm-js-collab/code-transformer-bundler-plugins/dist/esm/instrumentation-serde-C-Xxv-jj.js');
const options = require('./options.js');

const serializeInstrumentations = instrumentationSerdeCXxvJj.n;
function getSentryInstrumentations() {
  return index.SENTRY_INSTRUMENTATIONS;
}
function externalizedWebpackModules(externals, moduleNames) {
  const entries = Array.isArray(externals) ? externals : [externals];
  return moduleNames.filter(
    (name) => entries.some((entry) => {
      if (typeof entry === "string") {
        return options.externalEntryMatchesModule(entry, name);
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
  const resolved = resolve.resolveOrchestrionRuntimeRequest(resolve.SNIPPET_IMPORT_SPECIFIER);
  if (!resolved) {
    return;
  }
  const resolveOptions = (_a = compiler.options).resolve ?? (_a.resolve = {});
  const alias = resolveOptions.alias;
  if (Array.isArray(alias)) {
    if (!alias.some((entry) => entry.name === resolve.SNIPPET_IMPORT_SPECIFIER)) {
      alias.push({ name: resolve.SNIPPET_IMPORT_SPECIFIER, alias: resolved, onlyModule: true });
    }
    return;
  }
  const aliasMap = resolveOptions.alias = alias ?? {};
  if (!(`${resolve.SNIPPET_IMPORT_SPECIFIER}$` in aliasMap) && !(resolve.SNIPPET_IMPORT_SPECIFIER in aliasMap)) {
    aliasMap[`${resolve.SNIPPET_IMPORT_SPECIFIER}$`] = resolved;
  }
}
function sentryOrchestrionWebpackPlugin(options$1 = {}) {
  if (options$1.buildTimeInstrumentation === false) {
    return { apply: () => void 0 };
  }
  const plugin = webpack.default({
    ...options.orchestrionTransformOptions(options$1),
    // The upstream plugin's own loader path points into our `vendored/` tree at
    // a file rollup never emitted; use our bundled loader entrypoint instead
    // (which also bakes in the module-injected transform for Turbopack).
    loaderPath: resolve.getOrchestrionLoaderPath(),
    // The loader ident hashes the instrumentations and each custom transform's
    // source text, but not data a transform reads without naming it — our
    // subscriber-definitions table. Key persistent caches on the SDK version so
    // a release changing that table busts them.
    cacheVersion: core.SDK_VERSION
  });
  const moduleNames = index.instrumentedModuleNames(options$1.instrumentations);
  const apply = plugin.apply.bind(plugin);
  plugin.apply = (compiler) => {
    const externalizedModules = externalizedWebpackModules(compiler.options.externals, moduleNames);
    if (externalizedModules.length > 0) {
      compiler.hooks.thisCompilation.tap("SentryOrchestrionExternalsCheck", (compilation) => {
        compilation.warnings.push(new compiler.webpack.WebpackError(options.externalizedModulesWarning(externalizedModules)));
      });
    }
    addOrchestrionResolveAlias(compiler);
    apply(compiler);
  };
  return plugin;
}

exports.getOrchestrionLoaderPath = resolve.getOrchestrionLoaderPath;
exports.resolveOrchestrionRuntimeRequest = resolve.resolveOrchestrionRuntimeRequest;
exports.getSentryInstrumentations = getSentryInstrumentations;
exports.sentryOrchestrionWebpackPlugin = sentryOrchestrionWebpackPlugin;
exports.serializeInstrumentations = serializeInstrumentations;
//# sourceMappingURL=webpack.js.map
