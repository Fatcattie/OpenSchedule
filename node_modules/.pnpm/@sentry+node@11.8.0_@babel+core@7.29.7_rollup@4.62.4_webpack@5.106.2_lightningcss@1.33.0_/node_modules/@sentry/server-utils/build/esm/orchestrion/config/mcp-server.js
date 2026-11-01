import { getModuleNames } from './module-names.js';

const mcpServerV2Config = [
  {
    channelName: "mcpServerConstructor",
    module: {
      name: "@modelcontextprotocol/server",
      versionRange: ">=2.0.0 <3",
      filePath: /^dist\/mcp-[\w-]+\.(?:cjs|mjs)$/
    },
    // No `methodName` → class constructor. The `end` message's `self` is the new instance.
    functionQuery: { className: "McpServer" }
  }
];
const mcpServerV1Config = [
  {
    channelName: "mcpServerConstructor",
    module: {
      name: "@modelcontextprotocol/sdk",
      versionRange: ">=1.9.0 <2",
      filePath: /(?:^|\/)server\/mcp\.js$/
    },
    functionQuery: { className: "McpServer" }
  }
];
const mcpServerConfig = [...mcpServerV2Config, ...mcpServerV1Config];
const mcpServerModuleNames = getModuleNames(mcpServerConfig);
const mcpServerChannels = {
  // Orchestrion prefixes each `channelName` with `orchestrion:${module.name}:`, so v1 and v2
  // publish to distinct channels even though the suffix is shared — the integration subscribes
  // to both.
  MCP_SERVER_V2_CONSTRUCTOR: "orchestrion:@modelcontextprotocol/server:mcpServerConstructor",
  MCP_SERVER_V1_CONSTRUCTOR: "orchestrion:@modelcontextprotocol/sdk:mcpServerConstructor"
};

export { mcpServerChannels, mcpServerConfig, mcpServerModuleNames };
//# sourceMappingURL=mcp-server.js.map
