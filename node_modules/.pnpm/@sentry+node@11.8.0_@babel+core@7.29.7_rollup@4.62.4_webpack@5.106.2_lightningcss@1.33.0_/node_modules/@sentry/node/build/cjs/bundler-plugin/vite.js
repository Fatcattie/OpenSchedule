Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const vite = require('@sentry/bundler-plugins/vite');
const vite$1 = require('@sentry/server-utils/orchestrion/vite');

function sentryVitePlugin(options) {
  const bundlerPlugins = vite.sentryVitePlugin(options);
  return [...bundlerPlugins, vite$1.sentryOrchestrionPlugin(options)];
}

exports.sentryVitePlugin = sentryVitePlugin;
//# sourceMappingURL=vite.js.map
