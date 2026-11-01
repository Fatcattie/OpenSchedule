Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const esbuild = require('@sentry/bundler-plugins/esbuild');
const esbuild$1 = require('@sentry/server-utils/orchestrion/esbuild');

function sentryEsbuildPlugin(options) {
  const bundlerPlugin = esbuild.sentryEsbuildPlugin(options);
  const orchestrionPlugin = esbuild$1.sentryOrchestrionPlugin(options);
  return {
    name: "sentry-node-esbuild",
    async setup(build) {
      await bundlerPlugin.setup(build);
      await orchestrionPlugin.setup(build);
    }
  };
}

exports.sentryEsbuildPlugin = sentryEsbuildPlugin;
//# sourceMappingURL=esbuild.js.map
