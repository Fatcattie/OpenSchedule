import { getModuleNames } from './module-names.js';

const typesafeConfig = ["dist/index.mjs", "dist/index.cjs"].map((filePath) => ({
  channelName: "system-one",
  module: { name: "@typesafe-ai/sdk", versionRange: ">=0.5.0 <1", filePath },
  functionQuery: { className: "TypeSafeClient", methodName: "systemOne", kind: "Sync" }
}));
const typesafeModuleNames = getModuleNames(typesafeConfig);
const typesafeChannels = {
  TYPESAFE_SYSTEM_ONE: "orchestrion:@typesafe-ai/sdk:system-one"
};

export { typesafeChannels, typesafeConfig, typesafeModuleNames };
//# sourceMappingURL=typesafe.js.map
