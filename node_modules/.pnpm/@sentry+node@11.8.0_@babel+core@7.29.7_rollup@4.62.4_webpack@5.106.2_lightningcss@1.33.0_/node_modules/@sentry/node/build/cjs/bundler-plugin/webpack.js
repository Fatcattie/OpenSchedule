Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const webpack = require('@sentry/bundler-plugins/webpack');
const webpack$1 = require('@sentry/server-utils/orchestrion/webpack');

function sentryWebpackPlugin(options) {
  const bundlerPlugin = webpack.sentryWebpackPlugin(options);
  const orchestrionPlugin = webpack$1.sentryOrchestrionWebpackPlugin(options);
  return {
    apply(compiler) {
      bundlerPlugin.apply(compiler);
      orchestrionPlugin.apply(compiler);
    }
  };
}

exports.sentryWebpackPlugin = sentryWebpackPlugin;
//# sourceMappingURL=webpack.js.map
