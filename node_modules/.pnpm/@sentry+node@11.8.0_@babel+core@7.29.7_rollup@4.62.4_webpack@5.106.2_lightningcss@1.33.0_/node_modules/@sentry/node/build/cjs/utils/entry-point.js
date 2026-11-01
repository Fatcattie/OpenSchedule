Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const node_path = require('node:path');
const api = require('../sdk/api.js');

function parseProcessPaths(proc) {
  const { execArgv, argv, cwd: getCwd } = proc;
  const cwd = getCwd();
  const appPath = node_path.resolve(cwd, argv[1] || "");
  const joinedArgs = execArgv.join(" ");
  const importPaths = Array.from(joinedArgs.matchAll(/--import[ =](\S+)/g)).map((e) => node_path.resolve(cwd, e[1] || ""));
  const requirePaths = Array.from(joinedArgs.matchAll(/(?:--require|-r)[ =](\S+)/g)).map((e) => node_path.resolve(cwd, e[1] || ""));
  return { appPath, importPaths, requirePaths };
}
function getEntryPointType(proc = process) {
  const filenames = api.defaultStackParser(new Error().stack || "").map((f) => f.filename).filter(Boolean);
  const { appPath, importPaths, requirePaths } = parseProcessPaths(proc);
  const output = [];
  if (appPath && filenames.includes(appPath)) {
    output.push("app");
  }
  if (importPaths.some((p) => filenames.includes(p))) {
    output.push("import");
  }
  if (requirePaths.some((p) => filenames.includes(p))) {
    output.push("require");
  }
  if (output.length === 1) {
    return output[0];
  }
  return "unknown";
}

exports.getEntryPointType = getEntryPointType;
exports.parseProcessPaths = parseProcessPaths;
//# sourceMappingURL=entry-point.js.map
