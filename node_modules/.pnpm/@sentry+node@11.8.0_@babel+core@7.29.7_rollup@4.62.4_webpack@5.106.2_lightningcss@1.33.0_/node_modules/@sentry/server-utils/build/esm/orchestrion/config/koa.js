import { getModuleNames } from './module-names.js';

const koaConfig = [
  {
    channelName: "use",
    module: { name: "koa", versionRange: ">=2.0.0 <4", filePath: "lib/application.js" },
    functionQuery: { className: "Application", methodName: "use", kind: "Sync" }
  },
  // `callback()` gives us the live app via `ctx.self` so we can auto-register the
  // error listener. We act on the channel's `end` (after the method body runs):
  // koa registers its own default `error` listener inside `callback()` only when
  // none exist yet, so attaching before that would suppress koa's default error
  // logging. `app.listen()` funnels through `callback()`, so this covers both
  // `app.listen()` and `http.createServer(app.callback())`.
  {
    channelName: "callback",
    module: { name: "koa", versionRange: ">=2.0.0 <4", filePath: "lib/application.js" },
    functionQuery: { className: "Application", methodName: "callback", kind: "Sync" }
  }
];
const koaModuleNames = getModuleNames(koaConfig);
const koaChannels = {
  KOA_USE: "orchestrion:koa:use",
  KOA_CALLBACK: "orchestrion:koa:callback"
};

export { koaChannels, koaConfig, koaModuleNames };
//# sourceMappingURL=koa.js.map
