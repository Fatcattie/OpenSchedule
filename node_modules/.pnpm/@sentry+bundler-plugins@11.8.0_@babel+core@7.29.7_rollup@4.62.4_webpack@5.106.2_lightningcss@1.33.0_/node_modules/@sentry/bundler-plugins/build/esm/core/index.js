import { CodeInjection, stripQueryAndHashFromPath, containsOnlyImports } from './utils.js';
export { generateModuleMetadataInjectorCode, generateReleaseInjectorCode, replaceBooleanFlagsInCode, stringToUUID } from './utils.js';
export { globFiles } from './glob.js';
export { getCodeInjectionPosition } from './get-code-injection-position.js';
export { createComponentNameAnnotateHooks } from './component-annotate-hooks.js';
export { createSentryBuildPluginManager } from './build-plugin-manager.js';
export { addDebugIdToEmittedArtifacts, createDebugIdUploadFunction, stampDebugId } from './debug-id-upload.js';

function isJsFile(fileName) {
  const cleanFileName = stripQueryAndHashFromPath(fileName);
  return [".js", ".mjs", ".cjs"].some((ext) => cleanFileName.endsWith(ext));
}
function shouldSkipCodeInjection(code, facadeModuleId) {
  if (code.trim().length === 0) {
    return true;
  }
  if (facadeModuleId && stripQueryAndHashFromPath(facadeModuleId).endsWith(".html")) {
    return containsOnlyImports(code);
  }
  return false;
}
function getDebugIdSnippet(debugId) {
  return new CodeInjection(
    `var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="${debugId}",e._sentryDebugIdIdentifier="sentry-dbid-${debugId}");`
  );
}

export { CodeInjection, getDebugIdSnippet, isJsFile, shouldSkipCodeInjection };
//# sourceMappingURL=index.js.map
