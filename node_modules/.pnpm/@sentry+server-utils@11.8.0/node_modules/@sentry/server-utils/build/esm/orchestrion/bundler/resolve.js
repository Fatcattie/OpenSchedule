import { createRequire } from 'node:module';

const SNIPPET_IMPORT_SPECIFIER = "@sentry/server-utils";
const SNIPPET_IMPORT_SPECIFIER_FILTER = /^@sentry\/server-utils$/;
function getOrchestrionRequire() {
  let nodeRequire;
  nodeRequire = createRequire(import.meta.url);
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

export { SNIPPET_IMPORT_SPECIFIER, SNIPPET_IMPORT_SPECIFIER_FILTER, getOrchestrionLoaderPath, resolveOrchestrionRuntimeRequest };
//# sourceMappingURL=resolve.js.map
