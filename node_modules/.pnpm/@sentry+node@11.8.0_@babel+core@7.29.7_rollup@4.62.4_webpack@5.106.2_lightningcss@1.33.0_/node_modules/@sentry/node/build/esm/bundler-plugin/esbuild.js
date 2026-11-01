import { sentryEsbuildPlugin as sentryEsbuildPlugin$1 } from '@sentry/bundler-plugins/esbuild';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/esbuild';

function sentryEsbuildPlugin(options) {
  const bundlerPlugin = sentryEsbuildPlugin$1(options);
  const orchestrionPlugin = sentryOrchestrionPlugin(options);
  return {
    name: "sentry-node-esbuild",
    async setup(build) {
      await bundlerPlugin.setup(build);
      await orchestrionPlugin.setup(build);
    }
  };
}

export { sentryEsbuildPlugin };
//# sourceMappingURL=esbuild.js.map
