Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const moduleNames = require('./module-names.js');

const mysqlConfig = [
  {
    channelName: "query",
    module: { name: "mysql", versionRange: ">=2.0.0 <3", filePath: "lib/Connection.js" },
    functionQuery: { expressionName: "query", kind: "Auto" }
  }
];
const mysqlModuleNames = moduleNames.getModuleNames(mysqlConfig);
const mysqlChannels = {
  MYSQL_QUERY: "orchestrion:mysql:query"
};

exports.mysqlChannels = mysqlChannels;
exports.mysqlConfig = mysqlConfig;
exports.mysqlModuleNames = mysqlModuleNames;
//# sourceMappingURL=mysql.js.map
