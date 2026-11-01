Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const debugBuild = require('../../debug-build.js');
const wrapMiddlewareSpan = require('./wrapMiddlewareSpan.js');

const patchedUseInstances = /* @__PURE__ */ new WeakSet();
const patchedMethodInstances = /* @__PURE__ */ new WeakSet();
const HTTP_METHODS = ["get", "post", "put", "delete", "options", "patch", "all", "query"];
function patchAppUse(app) {
  if (patchedUseInstances.has(app)) {
    debugBuild.DEBUG_BUILD && core.debug.log("[hono] app.use already patched \u2014 skipping.");
    return;
  }
  patchedUseInstances.add(app);
  app.use = new Proxy(app.use, {
    apply(target, thisArg, args) {
      const [first, ...rest] = args;
      if (typeof first === "string") {
        const wrappedHandlers = rest.map((handler) => wrapMiddlewareSpan.wrapMiddlewareWithSpan(handler));
        return Reflect.apply(target, thisArg, [first, ...wrappedHandlers]);
      }
      const allHandlers = [first, ...rest].map((handler) => wrapMiddlewareSpan.wrapMiddlewareWithSpan(handler));
      return Reflect.apply(target, thisArg, allHandlers);
    }
  });
}
function patchHttpMethodHandlers(app) {
  if (patchedMethodInstances.has(app)) {
    debugBuild.DEBUG_BUILD && core.debug.log("[hono] HTTP method handlers already patched - skipping.");
    return;
  }
  patchedMethodInstances.add(app);
  for (const method of HTTP_METHODS) {
    patchRegistrationMethod(app, method, wrapInlineMiddleware);
  }
  patchRegistrationMethod(app, "on", (args) => {
    const [method, path, ...handlers] = args;
    return [method, path, ...wrapInlineMiddleware(handlers)];
  });
}
function wrapInlineMiddleware(args) {
  const hasPathPrefix = typeof args[0] === "string";
  const handlersStart = hasPathPrefix ? 1 : 0;
  const handlers = args.slice(handlersStart);
  if (handlers.length <= 1) {
    return args;
  }
  const wrapped = [...args];
  for (let i = handlersStart; i < wrapped.length - 1; i++) {
    wrapped[i] = wrapMiddlewareSpan.wrapMiddlewareWithSpan(wrapped[i]);
  }
  return wrapped;
}
function patchRegistrationMethod(app, method, transformArgs) {
  const registration = Reflect.get(app, method);
  if (typeof registration !== "function") {
    return;
  }
  const patchedRegistration = new Proxy(registration, {
    apply(target, thisArg, args) {
      return Reflect.apply(target, thisArg, transformArgs(args));
    }
  });
  Reflect.set(app, method, patchedRegistration);
}

exports.patchAppUse = patchAppUse;
exports.patchHttpMethodHandlers = patchHttpMethodHandlers;
//# sourceMappingURL=patchAppUse.js.map
