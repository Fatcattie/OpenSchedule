import { isMiddleware } from './isMiddleware.js';

function isRouteHandler(handler) {
  return typeof handler === "function" && !isMiddleware(handler);
}
function matchedRoutes(context) {
  return context.req.matchedRoutes ?? [];
}
function routePath(context, index) {
  const routes = matchedRoutes(context);
  return routes.at(index)?.path ?? "";
}
function resolveRouteName(context) {
  const routes = matchedRoutes(context);
  const current = routes[context.req.routeIndex];
  if (current && isRouteHandler(current.handler)) {
    return current.path;
  }
  for (let i = routes.length - 1; i >= 0; i--) {
    const route = routes[i];
    if (route && isRouteHandler(route.handler)) {
      return route.path;
    }
  }
  return routePath(context, -1);
}

export { resolveRouteName };
//# sourceMappingURL=resolveRouteName.js.map
