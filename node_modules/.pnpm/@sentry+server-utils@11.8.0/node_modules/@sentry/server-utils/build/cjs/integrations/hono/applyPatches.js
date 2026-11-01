Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const debugBuild = require('../../debug-build.js');
const patchAppRequest = require('./patchAppRequest.js');
const patchAppUse = require('./patchAppUse.js');
const patchRoute = require('./patchRoute.js');

let _routeHook;
function earlyPatchHono(honoClass) {
  _routeHook ?? (_routeHook = patchRoute.installRouteHookOnPrototype(Object.getPrototypeOf(honoClass.prototype)));
}
function applyPatches(app) {
  _routeHook = patchRoute.installRouteHookOnPrototype(Object.getPrototypeOf(Object.getPrototypeOf(app)));
  patchAppUse.patchAppUse(app);
  patchAppUse.patchHttpMethodHandlers(app);
  patchAppRequest.patchAppRequest(app);
  _routeHook.activate();
  const pendingSubApps = _routeHook.getPendingSubApps();
  if (pendingSubApps.size > 0) {
    debugBuild.DEBUG_BUILD && core.debug.log(
      `[hono] ${pendingSubApps.size} sub-app(s) were mounted before sentry(). Tracing is applied retroactively. Consider registering sentry() before calling app.route().`
    );
  }
  for (const subApp of pendingSubApps) {
    patchRoute.wrapSubAppMiddleware(subApp.routes);
    patchAppRequest.patchAppRequest(subApp);
  }
  pendingSubApps.clear();
}
function applyHonoPatches(app) {
  applyPatches(app);
}

exports.applyHonoPatches = applyHonoPatches;
exports.applyPatches = applyPatches;
exports.earlyPatchHono = earlyPatchHono;
//# sourceMappingURL=applyPatches.js.map
