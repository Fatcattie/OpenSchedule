import { glob } from 'glob';

function globFiles(patterns, options) {
  return glob(patterns, { absolute: true, nodir: true, ...options });
}

export { globFiles };
//# sourceMappingURL=glob.js.map
