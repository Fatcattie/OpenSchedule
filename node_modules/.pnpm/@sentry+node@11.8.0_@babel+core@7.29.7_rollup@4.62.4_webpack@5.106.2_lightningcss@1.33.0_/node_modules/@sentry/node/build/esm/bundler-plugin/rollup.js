import { sentryRollupPlugin as sentryRollupPlugin$1 } from '@sentry/bundler-plugins/rollup';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/rollup';

function sentryRollupPlugin(options) {
  const bundlerPlugins = sentryRollupPlugin$1(options);
  return [...bundlerPlugins, sentryOrchestrionPlugin(options)];
}

export { sentryRollupPlugin };
//# sourceMappingURL=rollup.js.map
