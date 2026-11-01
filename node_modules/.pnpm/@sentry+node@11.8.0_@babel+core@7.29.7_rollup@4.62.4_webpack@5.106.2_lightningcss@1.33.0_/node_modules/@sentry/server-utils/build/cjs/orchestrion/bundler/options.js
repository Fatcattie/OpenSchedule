Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const index = require('../config/index.js');
const moduleInjectedTransform = require('./moduleInjectedTransform.js');

function externalEntryMatchesModule(entry, moduleName) {
  return entry === moduleName || entry.startsWith(`${moduleName}/`);
}
function externalizedModulesWarning(externalizedModules) {
  return `The following packages are marked as external in your bundler configuration but need to be bundled for Sentry instrumentation to work: ${externalizedModules.join(", ")}. Remove them from your bundler's "external" configuration, or use the Sentry Node SDK's runtime instrumentation instead.`;
}
function orchestrionTransformOptions(options, { injectDiagnostics = true } = {}) {
  return {
    instrumentations: [...index.SENTRY_INSTRUMENTATIONS, ...options.instrumentations || []],
    customTransforms: { ...options.customTransforms, ...moduleInjectedTransform.moduleInjectedTransforms() },
    ...options.dcModule && { dcModule: options.dcModule },
    ...injectDiagnostics && { injectDiagnostics: () => moduleInjectedTransform.ORCHESTRION_BUNDLER_MARKER_BANNER }
  };
}

exports.ORCHESTRION_BUNDLER_MARKER_BANNER = moduleInjectedTransform.ORCHESTRION_BUNDLER_MARKER_BANNER;
exports.externalEntryMatchesModule = externalEntryMatchesModule;
exports.externalizedModulesWarning = externalizedModulesWarning;
exports.orchestrionTransformOptions = orchestrionTransformOptions;
//# sourceMappingURL=options.js.map
