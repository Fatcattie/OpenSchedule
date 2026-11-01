import { getModuleNames } from './module-names.js';

const genericPoolConfig = [
  {
    channelName: "acquire",
    module: { name: "generic-pool", versionRange: ">=3.0.0 <4", filePath: "lib/Pool.js" },
    functionQuery: { className: "Pool", methodName: "acquire", kind: "Auto" }
  },
  {
    channelName: "acquire",
    module: { name: "generic-pool", versionRange: ">=2.4.0 <3", filePath: "lib/generic-pool.js" },
    functionQuery: { expressionName: "acquire", kind: "Callback" }
  }
];
const genericPoolModuleNames = getModuleNames(genericPoolConfig);
const genericPoolChannels = {
  GENERIC_POOL_ACQUIRE: "orchestrion:generic-pool:acquire"
};

export { genericPoolChannels, genericPoolConfig, genericPoolModuleNames };
//# sourceMappingURL=generic-pool.js.map
