import { attachKoaErrorHandler } from '@sentry/server-utils';

const setupKoaErrorHandler = (app) => {
  attachKoaErrorHandler(app);
};

export { setupKoaErrorHandler };
//# sourceMappingURL=koa.js.map
