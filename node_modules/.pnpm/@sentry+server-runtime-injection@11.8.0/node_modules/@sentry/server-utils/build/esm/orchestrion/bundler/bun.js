import codeTransformerBun from '../../vendored/@apm-js-collab/code-transformer-bundler-plugins/dist/esm/bun.js';
import { instrumentedModuleNames, withoutInstrumentedExternals } from '../config/index.js';
import { ORCHESTRION_BUNDLER_MARKER_BANNER } from './moduleInjectedTransform.js';
import { orchestrionTransformOptions } from './options.js';

function sentryOrchestrionPlugin(options = {}) {
  if (options.buildTimeInstrumentation === false) {
    return { name: "sentry-orchestrion-disabled", setup: () => void 0 };
  }
  const transformer = codeTransformerBun(
    orchestrionTransformOptions(options, { injectDiagnostics: false })
  );
  const moduleNames = instrumentedModuleNames(options.instrumentations);
  return {
    name: "sentry-orchestrion",
    setup(build) {
      if (build.config) {
        const existing = build.config.banner ?? "";
        build.config.banner = existing ? `${existing}
${ORCHESTRION_BUNDLER_MARKER_BANNER}` : ORCHESTRION_BUNDLER_MARKER_BANNER;
        build.config.external = withoutInstrumentedExternals(build.config.external, moduleNames);
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

export { sentryOrchestrionPlugin };
//# sourceMappingURL=bun.js.map
