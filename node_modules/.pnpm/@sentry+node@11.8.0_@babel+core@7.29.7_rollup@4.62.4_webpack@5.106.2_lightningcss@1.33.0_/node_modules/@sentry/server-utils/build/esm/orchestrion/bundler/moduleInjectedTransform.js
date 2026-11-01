import { parse } from '../../vendored/meriyah/dist/meriyah.js';
import { subscriberExportForModule } from '../config/channel-integration-definitions.js';
import { MODULE_REGISTRATION_TRANSFORM } from '../config/registration-only.js';

const injectedPrograms = /* @__PURE__ */ new WeakSet();
const DEFAULT_IMPORT_SPECIFIER = "@sentry/server-utils";
const MODULE_INJECTED_SINK = "globalThis.__SENTRY_ORCHESTRION_INJECT__";
const ORCHESTRION_BUNDLER_MARKER_BANNER = ";(function(){var g=globalThis.__SENTRY_ORCHESTRION__=globalThis.__SENTRY_ORCHESTRION__||{};g.bundler=g.bundler||new Set();})();";
function moduleInjectedSnippet(moduleName, exportName, esm, importSpecifier) {
  const bindings = exportName ? `orchestrionModuleInjected, ${exportName}` : "orchestrionModuleInjected";
  const importStmt = esm ? `import { ${bindings} } from ${JSON.stringify(importSpecifier)};` : `const { ${bindings} } = require(${JSON.stringify(importSpecifier)});`;
  const args = exportName ? `${JSON.stringify(moduleName)}, () => ${exportName}()` : JSON.stringify(moduleName);
  return `${importStmt}
${MODULE_INJECTED_SINK} = orchestrionModuleInjected(${args});`;
}
function moduleInjectedTransforms(importSpecifier) {
  const spliceModuleInjected = (state, program) => {
    const { moduleType, module } = state;
    const node = program;
    if (injectedPrograms.has(node)) {
      return;
    }
    const moduleName = module?.name;
    if (!moduleName) {
      return;
    }
    injectedPrograms.add(node);
    const specifier = (typeof importSpecifier === "function" ? importSpecifier() : importSpecifier) ?? DEFAULT_IMPORT_SPECIFIER;
    const exportName = subscriberExportForModule(moduleName);
    const statements = parse(moduleInjectedSnippet(moduleName, exportName, moduleType === "esm", specifier), {
      module: moduleType === "esm",
      next: true
    }).body;
    const directiveIndex = node.body.findIndex((n) => n.type === "ExpressionStatement" && n.directive === "use strict");
    node.body.splice(directiveIndex + 1, 0, ...statements);
  };
  const injectModuleInjected = (state, program, parent, ancestry) => {
    const { transforms } = state;
    transforms.defaults.tracingChannelImport(state, program, parent, ancestry);
    spliceModuleInjected(state, program);
  };
  const injectRegistrationOnly = (state, node) => {
    spliceModuleInjected(state, node);
  };
  return {
    tracingChannelImport: injectModuleInjected,
    [MODULE_REGISTRATION_TRANSFORM]: injectRegistrationOnly
  };
}

export { ORCHESTRION_BUNDLER_MARKER_BANNER, moduleInjectedTransforms };
//# sourceMappingURL=moduleInjectedTransform.js.map
