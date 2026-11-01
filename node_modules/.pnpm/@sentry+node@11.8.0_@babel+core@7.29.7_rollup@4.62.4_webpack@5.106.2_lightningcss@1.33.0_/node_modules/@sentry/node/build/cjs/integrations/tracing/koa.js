Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const serverUtils = require('@sentry/server-utils');

const setupKoaErrorHandler = (app) => {
  serverUtils.attachKoaErrorHandler(app);
};

exports.setupKoaErrorHandler = setupKoaErrorHandler;
//# sourceMappingURL=koa.js.map
