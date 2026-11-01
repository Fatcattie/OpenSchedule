Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

function getModuleNames(configs) {
  return [...new Set(configs.map((config) => config.module.name))];
}

exports.getModuleNames = getModuleNames;
//# sourceMappingURL=module-names.js.map
