Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const registrationOnly = require('./registration-only.js');

const flueConfig = [
  registrationOnly.registrationOnly({ name: "@flue/runtime", versionRange: ">=2.0.0 <3.0.0", filePath: "dist/index.mjs" })
];

exports.flueConfig = flueConfig;
//# sourceMappingURL=flue.js.map
