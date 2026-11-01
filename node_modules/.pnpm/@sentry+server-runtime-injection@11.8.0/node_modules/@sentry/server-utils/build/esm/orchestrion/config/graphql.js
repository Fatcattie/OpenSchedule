import { getModuleNames } from './module-names.js';

const graphqlConfig = [
  ...["language/parser.js", "language/parser.mjs"].map((filePath) => ({
    channelName: "parse",
    module: { name: "graphql", versionRange: ">=14.0.0 <17", filePath },
    functionQuery: { functionName: "parse", kind: "Sync" }
  })),
  ...["validation/validate.js", "validation/validate.mjs"].map((filePath) => ({
    channelName: "validate",
    module: { name: "graphql", versionRange: ">=14.0.0 <17", filePath },
    functionQuery: { functionName: "validate", kind: "Sync" }
  })),
  ...["execution/execute.js", "execution/execute.mjs"].map((filePath) => ({
    channelName: "execute",
    module: { name: "graphql", versionRange: ">=14.0.0 <17", filePath },
    functionQuery: { functionName: "execute", kind: "Auto" }
  }))
];
const graphqlChannels = {
  GRAPHQL_PARSE: "orchestrion:graphql:parse",
  GRAPHQL_VALIDATE: "orchestrion:graphql:validate",
  GRAPHQL_EXECUTE: "orchestrion:graphql:execute"
};
const graphqlModuleNames = getModuleNames(graphqlConfig);

export { graphqlChannels, graphqlConfig, graphqlModuleNames };
//# sourceMappingURL=graphql.js.map
