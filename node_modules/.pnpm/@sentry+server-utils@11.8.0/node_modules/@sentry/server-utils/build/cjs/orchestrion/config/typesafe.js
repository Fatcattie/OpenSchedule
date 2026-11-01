Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const moduleNames = require('./module-names.js');

const typesafeConfig = ["dist/index.mjs", "dist/index.cjs"].map((filePath) => ({
  channelName: "system-one",
  module: { name: "@typesafe-ai/sdk", versionRange: ">=0.5.0 <1", filePath },
  functionQuery: { className: "TypeSafeClient", methodName: "systemOne", kind: "Sync" }
}));
const typesafeModuleNames = moduleNames.getModuleNames(typesafeConfig);
const typesafeChannels = {
  TYPESAFE_SYSTEM_ONE: "orchestrion:@typesafe-ai/sdk:system-one"
};

exports.typesafeChannels = typesafeChannels;
exports.typesafeConfig = typesafeConfig;
exports.typesafeModuleNames = typesafeModuleNames;
//# sourceMappingURL=typesafe.js.map
