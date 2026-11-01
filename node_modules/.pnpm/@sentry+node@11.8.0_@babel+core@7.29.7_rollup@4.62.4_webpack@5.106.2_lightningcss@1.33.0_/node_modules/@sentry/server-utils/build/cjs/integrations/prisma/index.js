Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const prisma = require('../../orchestrion/config/prisma.js');
const instrumentation = require('../../orchestrion/instrumentation.js');
const global = require('./global.js');
const orchestrion = require('./orchestrion.js');
const tracingHelper = require('./tracing-helper.js');

const INTEGRATION_NAME = "Prisma";
function instrumentPrisma(options) {
  global.setGlobalTracingHelper(
    new tracingHelper.ActiveTracingHelper({
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
      instrumentation.invokeOrchestrionInstrumentation(client, prisma.prismaModuleNames, orchestrion.instrumentPrismaV8, [
        { ignoreSpanTypes: options?.instrumentationConfig?.ignoreSpanTypes ?? [] }
      ]);
    }
  };
});
const prismaIntegration = core.defineIntegration(_prismaIntegration);

exports.instrumentPrisma = instrumentPrisma;
exports.prismaIntegration = prismaIntegration;
//# sourceMappingURL=index.js.map
