Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const serverUtils = require('@sentry/server-utils');

function getAutoPerformanceIntegrations() {
  return serverUtils.getTracingIntegrations();
}

exports.getAutoPerformanceIntegrations = getAutoPerformanceIntegrations;
//# sourceMappingURL=index.js.map
