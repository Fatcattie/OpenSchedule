import { isClientClosed } from './client.js';
import { getClient, getCurrentScope } from './currentScopes.js';
import { DEBUG_BUILD } from './debug-build.js';
import { consoleSandbox, debug } from './utils/debug-logger.js';

function initAndBind(clientClass, options) {
  if (options.debug === true) {
    if (DEBUG_BUILD) {
      debug.enable();
    } else {
      consoleSandbox(() => {
        console.warn("[Sentry] Cannot initialize SDK with `debug` option using a non-debug bundle.");
      });
    }
  }
  warnIfClientIsActive();
  const scope = getCurrentScope();
  scope.update(options.initialScope);
  const client = new clientClass(options);
  setCurrentClient(client);
  client.init();
  return client;
}
function getActiveClient() {
  const client = getClient();
  return client && !isClientClosed(client) ? client : void 0;
}
function warnIfClientIsActive() {
  if (getActiveClient()) {
    consoleSandbox(() => {
      console.warn(
        "[Sentry] `Sentry.init()` was called more than once. The new client replaces the active client, but the active client is not closed, so state from both can mix. Call `Sentry.init()` only once, or call `await Sentry.close()` before you call it again."
      );
    });
  }
}
function setCurrentClient(client) {
  getCurrentScope().setClient(client);
}

export { getActiveClient, initAndBind, setCurrentClient, warnIfClientIsActive };
//# sourceMappingURL=sdk.js.map
