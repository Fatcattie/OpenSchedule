Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const localVariablesAsync = require('./local-variables-async.js');

const localVariablesIntegration = (options = {}) => {
  return localVariablesAsync.localVariablesAsyncIntegration(options);
};

exports.localVariablesIntegration = localVariablesIntegration;
//# sourceMappingURL=index.js.map
