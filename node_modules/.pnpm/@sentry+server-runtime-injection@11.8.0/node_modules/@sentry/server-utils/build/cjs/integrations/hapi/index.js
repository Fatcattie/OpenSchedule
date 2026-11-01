Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const diagnosticsChannel = require('../../utils/diagnosticsChannel.js');
const core = require('@sentry/core');
const channels = require('../../orchestrion/channels.js');
const hapi = require('../../orchestrion/config/hapi.js');
const instrumentation = require('../../orchestrion/instrumentation.js');
const hapiErrorHandler = require('./hapi-error-handler.js');
const hapiUtils = require('./hapi-utils.js');

const INTEGRATION_NAME = "Hapi";
const _hapiIntegration = (({ shouldHandleError } = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      instrumentation.invokeOrchestrionInstrumentation(client, hapi.hapiModuleNames, instrumentHapi, [shouldHandleError], {
        requiresTracingChannelBinding: false
      });
    }
  };
});
function instrumentHapi(shouldHandleError) {
  diagnosticsChannel.tracingChannel(channels.CHANNELS.HAPI_ROUTE).subscribe({
    start(rawCtx) {
      const ctx = rawCtx;
      hapiUtils.wrapRouteArguments(ctx.arguments, ctx.self?.realm?.plugin);
    },
    end() {
    },
    asyncStart() {
    },
    asyncEnd() {
    },
    error() {
    }
  });
  diagnosticsChannel.tracingChannel(channels.CHANNELS.HAPI_EXT).subscribe({
    start(rawCtx) {
      const ctx = rawCtx;
      hapiUtils.wrapExtArguments(ctx.arguments, ctx.self?.realm?.plugin);
    },
    end() {
    },
    asyncStart() {
    },
    asyncEnd() {
    },
    error() {
    }
  });
  const attachOnStart = {
    start(rawCtx) {
      const server = rawCtx.self;
      if (server) {
        hapiErrorHandler.attachHapiErrorHandler(server, shouldHandleError);
      }
    },
    end() {
    },
    asyncStart() {
    },
    asyncEnd() {
    },
    error() {
    }
  };
  diagnosticsChannel.tracingChannel(channels.CHANNELS.HAPI_START).subscribe(attachOnStart);
  diagnosticsChannel.tracingChannel(channels.CHANNELS.HAPI_INITIALIZE).subscribe(attachOnStart);
}
const hapiIntegration = core.defineIntegration(_hapiIntegration);

exports.hapiIntegration = hapiIntegration;
//# sourceMappingURL=index.js.map
