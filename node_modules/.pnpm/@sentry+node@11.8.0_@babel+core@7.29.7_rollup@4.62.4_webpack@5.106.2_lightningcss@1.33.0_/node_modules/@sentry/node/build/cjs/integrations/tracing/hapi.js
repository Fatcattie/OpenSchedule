Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const serverUtils = require('@sentry/server-utils');

async function setupHapiErrorHandler(server) {
  serverUtils.attachHapiErrorHandler(server);
}

exports.setupHapiErrorHandler = setupHapiErrorHandler;
//# sourceMappingURL=hapi.js.map
