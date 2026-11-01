import { debug } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build.js';
import { patchAppRequest } from './patchAppRequest.js';
import { patchAppUse, patchHttpMethodHandlers } from './patchAppUse.js';
import { installRouteHookOnPrototype, wrapSubAppMiddleware } from './patchRoute.js';

let _routeHook;
function earlyPatchHono(honoClass) {
  _routeHook ?? (_routeHook = installRouteHookOnPrototype(Object.getPrototypeOf(honoClass.prototype)));
}
function applyPatches(app) {
  _routeHook = installRouteHookOnPrototype(Object.getPrototypeOf(Object.getPrototypeOf(app)));
  patchAppUse(app);
  patchHttpMethodHandlers(app);
  patchAppRequest(app);
  _routeHook.activate();
  const pendingSubApps = _routeHook.getPendingSubApps();
  if (pendingSubApps.size > 0) {
    DEBUG_BUILD && debug.log(
      `[hono] ${pendingSubApps.size} sub-app(s) were mounted before sentry(). Tracing is applied retroactively. Consider registering sentry() before calling app.route().`
    );
  }
  for (const subApp of pendingSubApps) {
    wrapSubAppMiddleware(subApp.routes);
    patchAppRequest(subApp);
  }
  pendingSubApps.clear();
}
function applyHonoPatches(app) {
  applyPatches(app);
}

export { applyHonoPatches, applyPatches, earlyPatchHono };
//# sourceMappingURL=applyPatches.js.map
