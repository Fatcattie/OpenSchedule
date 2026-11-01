import { defineIntegration } from '@sentry/core';
import { prismaModuleNames } from '../../orchestrion/config/prisma.js';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation.js';
import { setGlobalTracingHelper } from './global.js';
import { instrumentPrismaV8 } from './orchestrion.js';
import { ActiveTracingHelper } from './tracing-helper.js';

const INTEGRATION_NAME = "Prisma";
function instrumentPrisma(options) {
  setGlobalTracingHelper(
    new ActiveTracingHelper({
      ignoreSpanTypes: options?.instrumentationConfig?.ignoreSpanTypes ?? []
    })
  );
}
const _prismaIntegration = ((options) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentPrisma(options);
    },
    // Prisma 8 has no tracing helper to install; its ORM terminals are instrumented via orchestrion instead.
    setup(client) {
      invokeOrchestrionInstrumentation(client, prismaModuleNames, instrumentPrismaV8, [
        { ignoreSpanTypes: options?.instrumentationConfig?.ignoreSpanTypes ?? [] }
      ]);
    }
  };
});
const prismaIntegration = defineIntegration(_prismaIntegration);

export { instrumentPrisma, prismaIntegration };
//# sourceMappingURL=index.js.map
