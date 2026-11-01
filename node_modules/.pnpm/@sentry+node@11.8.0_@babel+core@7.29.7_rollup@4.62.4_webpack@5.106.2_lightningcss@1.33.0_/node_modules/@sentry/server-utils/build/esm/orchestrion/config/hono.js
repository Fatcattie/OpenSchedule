import { getModuleNames } from './module-names.js';

const honoInstrumentationConfig = [
  {
    // `new Context()` runs once per request: where the Sentry middleware is injected and matched
    // middleware handlers are wrapped for spans.
    channelName: "context",
    module: { name: "hono", versionRange: ">=4.0.0 <5", filePath: /^dist\/(?:cjs\/)?context\.js$/ },
    functionQuery: { className: "Context" }
  },
  {
    // `app.request(...)` — Hono's internal dispatch for sub-app-to-sub-app fetches. A class-field
    // arrow, hence `astQuery` instead of `methodName`.
    channelName: "request",
    module: { name: "hono", versionRange: ">=4.0.0 <5", filePath: /^dist\/(?:cjs\/)?hono-base\.js$/ },
    astQuery: "PropertyDefinition[key.name='request'] > ArrowFunctionExpression",
    functionQuery: { kind: "Auto" }
  }
];
const honoConfig = honoInstrumentationConfig;
const honoModuleNames = getModuleNames(honoConfig);
const honoChannels = {
  HONO_CONTEXT: "orchestrion:hono:context",
  HONO_REQUEST: "orchestrion:hono:request"
};

export { honoChannels, honoConfig, honoModuleNames };
//# sourceMappingURL=hono.js.map
