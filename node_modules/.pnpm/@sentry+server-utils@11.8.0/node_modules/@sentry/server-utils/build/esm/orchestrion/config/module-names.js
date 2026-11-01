function getModuleNames(configs) {
  return [...new Set(configs.map((config) => config.module.name))];
}

export { getModuleNames };
//# sourceMappingURL=module-names.js.map
