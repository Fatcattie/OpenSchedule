import { tracingChannel } from '../../utils/diagnosticsChannel.js';
import { defineIntegration } from '@sentry/core';
import { CHANNELS } from '../../orchestrion/channels.js';
import { hapiModuleNames } from '../../orchestrion/config/hapi.js';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation.js';
import { attachHapiErrorHandler } from './hapi-error-handler.js';
import { wrapRouteArguments, wrapExtArguments } from './hapi-utils.js';

const INTEGRATION_NAME = "Hapi";
const _hapiIntegration = (({ shouldHandleError } = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, hapiModuleNames, instrumentHapi, [shouldHandleError], {
        requiresTracingChannelBinding: false
      });
    }
  };
});
function instrumentHapi(shouldHandleError) {
  tracingChannel(CHANNELS.HAPI_ROUTE).subscribe({
    start(rawCtx) {
      const ctx = rawCtx;
      wrapRouteArguments(ctx.arguments, ctx.self?.realm?.plugin);
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
  tracingChannel(CHANNELS.HAPI_EXT).subscribe({
    start(rawCtx) {
      const ctx = rawCtx;
      wrapExtArguments(ctx.arguments, ctx.self?.realm?.plugin);
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
        attachHapiErrorHandler(server, shouldHandleError);
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
  tracingChannel(CHANNELS.HAPI_START).subscribe(attachOnStart);
  tracingChannel(CHANNELS.HAPI_INITIALIZE).subscribe(attachOnStart);
}
const hapiIntegration = defineIntegration(_hapiIntegration);

export { hapiIntegration };
//# sourceMappingURL=index.js.map
