import { attachHapiErrorHandler } from '@sentry/server-utils';

async function setupHapiErrorHandler(server) {
  attachHapiErrorHandler(server);
}

export { setupHapiErrorHandler };
//# sourceMappingURL=hapi.js.map
