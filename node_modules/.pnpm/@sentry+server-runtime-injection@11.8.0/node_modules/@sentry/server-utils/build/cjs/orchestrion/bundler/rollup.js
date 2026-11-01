Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const node_module = require('node:module');
const rollupOTS4ktWb = require('../../vendored/@apm-js-collab/code-transformer-bundler-plugins/dist/esm/rollup-OTS4ktWb.js');
const index = require('../config/index.js');
const options = require('./options.js');
const resolve = require('./resolve.js');

function rawExternalMatchesModule(external, name) {
  if (typeof external === "function") {
    return !!external(name, void 0, false);
  }
  const entries = Array.isArray(external) ? external : [external];
  return entries.some(
    (entry) => typeof entry === "string" ? options.externalEntryMatchesModule(entry, name) : entry.test(name)
  );
}
function commonJSInteropOptions() {
  return {
    requireReturnsDefault: (id) => node_module.isBuiltin(id) ? true : "auto",
    ignoreTryCatch: (id) => !node_module.isBuiltin(id)
  };
}
const COMMONJS_HELPERS_ID = "\0commonjsHelpers.js";
const BROKEN_NAMESPACE_CHECK = "Object.keys(n).length === 1";
const FIXED_NAMESPACE_CHECK = "Object.keys(n).filter(k => k !== 'module.exports').length === 1";
function sentryCommonJSInteropPlugin() {
  return {
    name: "sentry-commonjs-interop",
    transform(code, id) {
      if (id !== COMMONJS_HELPERS_ID || !code.includes(BROKEN_NAMESPACE_CHECK)) {
        return null;
      }
      return { code: code.replace(BROKEN_NAMESPACE_CHECK, FIXED_NAMESPACE_CHECK), map: null };
    }
  };
}
function sentryOrchestrionPlugin(options$1 = {}) {
  if (options$1.buildTimeInstrumentation === false) {
    return { name: "sentry-orchestrion-disabled" };
  }
  const moduleNames = index.instrumentedModuleNames(options$1.instrumentations);
  let rawExternal;
  return {
    ...rollupOTS4ktWb.t(options.orchestrionTransformOptions(options$1)),
    options(inputOptions) {
      rawExternal = inputOptions.external;
      return null;
    },
    // The module-injected snippet imports `@sentry/server-utils` from INSIDE
    // transformed `node_modules` files. Under isolated installs (pnpm) that bare
    // specifier doesn't resolve from an instrumented package's location, so when
    // normal resolution fails, fall back to this package's own resolution so it
    // gets bundled from its real on-disk path.
    //
    // Forward `options` unchanged: it carries the `custom` metadata `@rollup/plugin-commonjs`
    // uses to recognize a `require()` it is already resolving. Drop it and that plugin warns
    // (THIS_RESOLVE_WITHOUT_OPTIONS), then abandons the resolution.
    async resolveId(source, importer, options2) {
      if (source !== resolve.SNIPPET_IMPORT_SPECIFIER) {
        return null;
      }
      const resolved = await this.resolve(source, importer, { ...options2, skipSelf: true });
      if (resolved) {
        return resolved;
      }
      return resolve.resolveOrchestrionRuntimeRequest(source) ?? null;
    },
    buildStart(rollupOptions) {
      const externalizedModules = moduleNames.filter(
        (name) => typeof rollupOptions.external === "function" ? rollupOptions.external(name, void 0, false) : rawExternal != null && rawExternalMatchesModule(rawExternal, name)
      );
      if (externalizedModules.length > 0) {
        this.warn(options.externalizedModulesWarning(externalizedModules));
      }
    }
  };
}

exports.commonJSInteropOptions = commonJSInteropOptions;
exports.sentryCommonJSInteropPlugin = sentryCommonJSInteropPlugin;
exports.sentryOrchestrionPlugin = sentryOrchestrionPlugin;
//# sourceMappingURL=rollup.js.map
