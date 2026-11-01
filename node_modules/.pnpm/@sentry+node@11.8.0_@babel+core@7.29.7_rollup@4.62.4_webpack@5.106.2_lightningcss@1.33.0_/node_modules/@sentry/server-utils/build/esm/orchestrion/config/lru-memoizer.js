import { getModuleNames } from './module-names.js';

const lruMemoizerConfig = [
  {
    channelName: "load",
    // `>=2.1.0` only: the named `function memoizedFunction()` the selector targets exists from 2.1.0
    module: { name: "lru-memoizer", versionRange: ">=2.1.0 <4", filePath: "lib/async.js" },
    functionQuery: { functionName: "memoizedFunction", kind: "Callback" }
  }
];
const lruMemoizerModuleNames = getModuleNames(lruMemoizerConfig);
const lruMemoizerChannels = {
  LRU_MEMOIZER_LOAD: "orchestrion:lru-memoizer:load"
};

export { lruMemoizerChannels, lruMemoizerConfig, lruMemoizerModuleNames };
//# sourceMappingURL=lru-memoizer.js.map
