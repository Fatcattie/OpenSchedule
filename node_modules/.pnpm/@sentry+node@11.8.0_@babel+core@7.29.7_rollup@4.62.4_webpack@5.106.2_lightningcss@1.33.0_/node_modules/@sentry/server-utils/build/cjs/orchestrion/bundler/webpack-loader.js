Object.defineProperties(exports, { __esModule: { value: true }, [Symbol.toStringTag]: { value: 'Module' } });

const webpackLoaderFactory = require('../../vendored/@apm-js-collab/code-transformer-bundler-plugins/dist/esm/webpack-loader-factory.js');
const node_path = require('node:path');
const moduleInjectedTransform = require('./moduleInjectedTransform.js');

let currentImportSpecifier;
const factoryLoader = webpackLoaderFactory.createLoader({
  customTransforms: moduleInjectedTransform.moduleInjectedTransforms(() => currentImportSpecifier)
});
function relativeImportSpecifier(fromFile, toFile) {
  const rel = node_path.relative(node_path.dirname(fromFile), toFile).replace(/\\/g, "/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}
const codeTransformerLoader = function(code, inputSourceMap) {
  const { importSpecifier, importHelperPath } = this.getOptions();
  currentImportSpecifier = importHelperPath ? relativeImportSpecifier(this.resourcePath, importHelperPath) : importSpecifier;
  return factoryLoader.call(this, code, inputSourceMap);
};

exports.default = codeTransformerLoader;
//# sourceMappingURL=webpack-loader.js.map
