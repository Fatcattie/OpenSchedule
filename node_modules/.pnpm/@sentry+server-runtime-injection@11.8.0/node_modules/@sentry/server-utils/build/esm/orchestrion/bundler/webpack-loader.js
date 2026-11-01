import { createLoader } from '../../vendored/@apm-js-collab/code-transformer-bundler-plugins/dist/esm/webpack-loader-factory.js';
import { relative, dirname } from 'node:path';
import { moduleInjectedTransforms } from './moduleInjectedTransform.js';

let currentImportSpecifier;
const factoryLoader = createLoader({
  customTransforms: moduleInjectedTransforms(() => currentImportSpecifier)
});
function relativeImportSpecifier(fromFile, toFile) {
  const rel = relative(dirname(fromFile), toFile).replace(/\\/g, "/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}
const codeTransformerLoader = function(code, inputSourceMap) {
  const { importSpecifier, importHelperPath } = this.getOptions();
  currentImportSpecifier = importHelperPath ? relativeImportSpecifier(this.resourcePath, importHelperPath) : importSpecifier;
  return factoryLoader.call(this, code, inputSourceMap);
};

export { codeTransformerLoader as default };
//# sourceMappingURL=webpack-loader.js.map
