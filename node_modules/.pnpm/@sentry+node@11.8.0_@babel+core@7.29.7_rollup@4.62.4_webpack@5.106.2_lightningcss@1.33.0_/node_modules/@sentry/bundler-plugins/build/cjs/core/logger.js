Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

function createLogger(options) {
  return {
    info(message, ...params) {
      if (!options.silent) {
        console.info(`${options.prefix} Info: ${message}`, ...params);
      }
    },
    warn(message, ...params) {
      if (!options.silent) {
        console.warn(`${options.prefix} Warning: ${message}`, ...params);
      }
    },
    error(message, ...params) {
      if (!options.silent) {
        console.error(`${options.prefix} Error: ${message}`, ...params);
      }
    },
    debug(message, ...params) {
      if (!options.silent && options.debug) {
        console.debug(`${options.prefix} Debug: ${message}`, ...params);
      }
    }
  };
}

exports.createLogger = createLogger;
//# sourceMappingURL=logger.js.map
