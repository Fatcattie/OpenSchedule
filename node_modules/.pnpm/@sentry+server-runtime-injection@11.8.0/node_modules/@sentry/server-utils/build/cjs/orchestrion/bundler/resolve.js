Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const node_module = require('node:module');

const SNIPPET_IMPORT_SPECIFIER = "@sentry/server-utils";
const SNIPPET_IMPORT_SPECIFIER_FILTER = /^@sentry\/server-utils$/;
function getOrchestrionRequire() {
  let nodeRequire;
  nodeRequire = node_module.createRequire(__filename);
  return nodeRequire;
}
function getOrchestrionLoaderPath() {
  return getOrchestrionRequire().resolve("@sentry/server-utils/orchestrion/webpack-loader");
}
function resolveOrchestrionRuntimeRequest(request) {
  try {
    return getOrchestrionRequire().resolve(request);
  } catch {
    return void 0;
  }
}

exports.SNIPPET_IMPORT_SPECIFIER = SNIPPET_IMPORT_SPECIFIER;
exports.SNIPPET_IMPORT_SPECIFIER_FILTER = SNIPPET_IMPORT_SPECIFIER_FILTER;
exports.getOrchestrionLoaderPath = getOrchestrionLoaderPath;
exports.resolveOrchestrionRuntimeRequest = resolveOrchestrionRuntimeRequest;
//# sourceMappingURL=resolve.js.map
