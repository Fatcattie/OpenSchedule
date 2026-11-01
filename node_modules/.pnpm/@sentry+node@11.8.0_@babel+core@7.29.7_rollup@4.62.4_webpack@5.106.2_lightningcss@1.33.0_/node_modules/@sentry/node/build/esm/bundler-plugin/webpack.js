import { sentryWebpackPlugin as sentryWebpackPlugin$1 } from '@sentry/bundler-plugins/webpack';
import { sentryOrchestrionWebpackPlugin } from '@sentry/server-utils/orchestrion/webpack';

function sentryWebpackPlugin(options) {
  const bundlerPlugin = sentryWebpackPlugin$1(options);
  const orchestrionPlugin = sentryOrchestrionWebpackPlugin(options);
  return {
    apply(compiler) {
      bundlerPlugin.apply(compiler);
      orchestrionPlugin.apply(compiler);
    }
  };
}

export { sentryWebpackPlugin };
//# sourceMappingURL=webpack.js.map
