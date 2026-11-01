Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const moduleNames = require('./module-names.js');

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
const genericPoolModuleNames = moduleNames.getModuleNames(genericPoolConfig);
const genericPoolChannels = {
  GENERIC_POOL_ACQUIRE: "orchestrion:generic-pool:acquire"
};

exports.genericPoolChannels = genericPoolChannels;
exports.genericPoolConfig = genericPoolConfig;
exports.genericPoolModuleNames = genericPoolModuleNames;
//# sourceMappingURL=generic-pool.js.map
