Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const bun = require('../../vendored/@apm-js-collab/code-transformer-bundler-plugins/dist/esm/bun.js');
const index = require('../config/index.js');
const moduleInjectedTransform = require('./moduleInjectedTransform.js');
const options = require('./options.js');

function sentryOrchestrionPlugin(options$1 = {}) {
  if (options$1.buildTimeInstrumentation === false) {
    return { name: "sentry-orchestrion-disabled", setup: () => void 0 };
  }
  const transformer = bun.default(
    options.orchestrionTransformOptions(options$1, { injectDiagnostics: false })
  );
  const moduleNames = index.instrumentedModuleNames(options$1.instrumentations);
  return {
    name: "sentry-orchestrion",
    setup(build) {
      if (build.config) {
        const existing = build.config.banner ?? "";
        build.config.banner = existing ? `${existing}
${moduleInjectedTransform.ORCHESTRION_BUNDLER_MARKER_BANNER}` : moduleInjectedTransform.ORCHESTRION_BUNDLER_MARKER_BANNER;
        build.config.external = index.withoutInstrumentedExternals(build.config.external, moduleNames);
        const blanketExternal = build.config.packages === "external" ? "packages: 'external'" : build.config.external?.includes("*") ? "'*' in external" : void 0;
        if (blanketExternal) {
          console.warn(
            `[Sentry] This Bun build externalizes all dependencies (${blanketExternal}), so Sentry cannot instrument bundled libraries. Instrumentation will be missing for any of these packages your app uses: ${moduleNames.join(", ")}. To instrument them, externalize only the specific packages you need external instead of all of them.`
          );
        }
      }
      transformer.setup(build);
    }
  };
}

exports.sentryOrchestrionPlugin = sentryOrchestrionPlugin;
//# sourceMappingURL=bun.js.map
