import { SENTRY_INSTRUMENTATIONS } from '../config/index.js';
import { ORCHESTRION_BUNDLER_MARKER_BANNER, moduleInjectedTransforms } from './moduleInjectedTransform.js';

function externalEntryMatchesModule(entry, moduleName) {
  return entry === moduleName || entry.startsWith(`${moduleName}/`);
}
function externalizedModulesWarning(externalizedModules) {
  return `The following packages are marked as external in your bundler configuration but need to be bundled for Sentry instrumentation to work: ${externalizedModules.join(", ")}. Remove them from your bundler's "external" configuration, or use the Sentry Node SDK's runtime instrumentation instead.`;
}
function orchestrionTransformOptions(options, { injectDiagnostics = true } = {}) {
  return {
    instrumentations: [...SENTRY_INSTRUMENTATIONS, ...options.instrumentations || []],
    customTransforms: { ...options.customTransforms, ...moduleInjectedTransforms() },
    ...options.dcModule && { dcModule: options.dcModule },
    ...injectDiagnostics && { injectDiagnostics: () => ORCHESTRION_BUNDLER_MARKER_BANNER }
  };
}

export { ORCHESTRION_BUNDLER_MARKER_BANNER, externalEntryMatchesModule, externalizedModulesWarning, orchestrionTransformOptions };
//# sourceMappingURL=options.js.map
