Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const utils = require('./utils.js');
const glob = require('./glob.js');
const getCodeInjectionPosition = require('./get-code-injection-position.js');
const componentAnnotateHooks = require('./component-annotate-hooks.js');
const buildPluginManager = require('./build-plugin-manager.js');
const debugIdUpload = require('./debug-id-upload.js');

function isJsFile(fileName) {
  const cleanFileName = utils.stripQueryAndHashFromPath(fileName);
  return [".js", ".mjs", ".cjs"].some((ext) => cleanFileName.endsWith(ext));
}
function shouldSkipCodeInjection(code, facadeModuleId) {
  if (code.trim().length === 0) {
    return true;
  }
  if (facadeModuleId && utils.stripQueryAndHashFromPath(facadeModuleId).endsWith(".html")) {
    return utils.containsOnlyImports(code);
  }
  return false;
}
function getDebugIdSnippet(debugId) {
  return new utils.CodeInjection(
    `var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="${debugId}",e._sentryDebugIdIdentifier="sentry-dbid-${debugId}");`
  );
}

exports.CodeInjection = utils.CodeInjection;
exports.generateModuleMetadataInjectorCode = utils.generateModuleMetadataInjectorCode;
exports.generateReleaseInjectorCode = utils.generateReleaseInjectorCode;
exports.replaceBooleanFlagsInCode = utils.replaceBooleanFlagsInCode;
exports.stringToUUID = utils.stringToUUID;
exports.globFiles = glob.globFiles;
exports.getCodeInjectionPosition = getCodeInjectionPosition.getCodeInjectionPosition;
exports.createComponentNameAnnotateHooks = componentAnnotateHooks.createComponentNameAnnotateHooks;
exports.createSentryBuildPluginManager = buildPluginManager.createSentryBuildPluginManager;
exports.addDebugIdToEmittedArtifacts = debugIdUpload.addDebugIdToEmittedArtifacts;
exports.createDebugIdUploadFunction = debugIdUpload.createDebugIdUploadFunction;
exports.stampDebugId = debugIdUpload.stampDebugId;
exports.getDebugIdSnippet = getDebugIdSnippet;
exports.isJsFile = isJsFile;
exports.shouldSkipCodeInjection = shouldSkipCodeInjection;
//# sourceMappingURL=index.js.map
