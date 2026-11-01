import { sentryVitePlugin as sentryVitePlugin$1 } from '@sentry/bundler-plugins/vite';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';

function sentryVitePlugin(options) {
  const bundlerPlugins = sentryVitePlugin$1(options);
  return [...bundlerPlugins, sentryOrchestrionPlugin(options)];
}

export { sentryVitePlugin };
//# sourceMappingURL=vite.js.map
