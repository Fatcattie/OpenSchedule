Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const glob = require('glob');

function globFiles(patterns, options) {
  return glob.glob(patterns, { absolute: true, nodir: true, ...options });
}

exports.globFiles = globFiles;
//# sourceMappingURL=glob.js.map
