Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const rollup = require('@sentry/bundler-plugins/rollup');
const rollup$1 = require('@sentry/server-utils/orchestrion/rollup');

function sentryRollupPlugin(options) {
  const bundlerPlugins = rollup.sentryRollupPlugin(options);
  return [...bundlerPlugins, rollup$1.sentryOrchestrionPlugin(options)];
}

exports.sentryRollupPlugin = sentryRollupPlugin;
//# sourceMappingURL=rollup.js.map
