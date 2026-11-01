import { debug, getOriginalFunction } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build.js';
import { isMiddleware } from './isMiddleware.js';
import { patchAppRequest } from './patchAppRequest.js';
import { wrapMiddlewareWithSpan } from './wrapMiddlewareSpan.js';

function createRouteHook() {
  const pendingSubApps = /* @__PURE__ */ new Set();
  let activated = false;
  return {
    handle: {
      activate: () => {
        activated = true;
      },
      getPendingSubApps: () => pendingSubApps
    },
    onSubAppMounted: (subApp) => {
      if (activated) {
        DEBUG_BUILD && debug.log(`[hono] Instrumenting sub-app at mount time (${subApp.routes.length} routes).`);
        wrapSubAppMiddleware(subApp.routes);
        patchAppRequest(subApp);
      } else {
        DEBUG_BUILD && debug.log(`[hono] Collecting sub-app for deferred instrumentation (${subApp.routes.length} routes).`);
        pendingSubApps.add(subApp);
      }
    }
  };
}
function installRouteHookOnPrototype(honoBaseProto) {
  const noopHandle = { activate: () => {
  }, getPendingSubApps: () => /* @__PURE__ */ new Set() };
  if (!honoBaseProto || typeof honoBaseProto.route !== "function") {
    DEBUG_BUILD && debug.warn("[hono] Could not find HonoBase.prototype.route \u2014 sub-app instrumentation disabled.");
    return noopHandle;
  }
  if (getOriginalFunction(honoBaseProto.route)) {
    return honoBaseProto.__sentryRouteHook__ ?? noopHandle;
  }
  const originalRoute = honoBaseProto.route;
  const { handle, onSubAppMounted } = createRouteHook();
  honoBaseProto.route = new Proxy(originalRoute, {
    apply(_target, thisArg, args) {
      const [, subApp] = args;
      if (subApp && Array.isArray(subApp.routes)) {
        onSubAppMounted(subApp);
      }
      return Reflect.apply(_target, thisArg, args);
    },
    get(target, prop, receiver) {
      if (prop === "__sentry_original__") {
        return originalRoute;
      }
      return Reflect.get(target, prop, receiver);
    }
  });
  honoBaseProto.__sentryRouteHook__ = handle;
  DEBUG_BUILD && debug.log("[hono] Installed route hook on HonoBase.prototype.");
  return handle;
}
function wrapSubAppMiddleware(routes) {
  const lastIndexByKey = /* @__PURE__ */ new Map();
  for (const [i, route] of routes.entries()) {
    lastIndexByKey.set(`${route.method}\0${route.path}`, i);
  }
  for (const [i, route] of routes.entries()) {
    if (typeof route.handler !== "function") {
      continue;
    }
    const isLastForGroup = lastIndexByKey.get(`${route.method}\0${route.path}`) === i;
    const isMW = !isLastForGroup || route.method === "ALL" && isMiddleware(route.handler);
    if (isMW) {
      route.handler = wrapMiddlewareWithSpan(route.handler);
    }
  }
}

export { installRouteHookOnPrototype, wrapSubAppMiddleware };
//# sourceMappingURL=patchRoute.js.map
