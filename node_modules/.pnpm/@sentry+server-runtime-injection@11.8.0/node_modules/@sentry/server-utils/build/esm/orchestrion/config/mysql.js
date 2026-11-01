import { getModuleNames } from './module-names.js';

const mysqlConfig = [
  {
    channelName: "query",
    module: { name: "mysql", versionRange: ">=2.0.0 <3", filePath: "lib/Connection.js" },
    functionQuery: { expressionName: "query", kind: "Auto" }
  }
];
const mysqlModuleNames = getModuleNames(mysqlConfig);
const mysqlChannels = {
  MYSQL_QUERY: "orchestrion:mysql:query"
};

export { mysqlChannels, mysqlConfig, mysqlModuleNames };
//# sourceMappingURL=mysql.js.map
