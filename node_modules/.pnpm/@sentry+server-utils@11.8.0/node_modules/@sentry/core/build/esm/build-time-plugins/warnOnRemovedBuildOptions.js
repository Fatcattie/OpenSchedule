import { consoleSandbox } from '../utils/debug-logger.js';

function warnOnRemovedBuildOptions(options, removedKeys, logWarning = (message) => consoleSandbox(() => {
  console.warn(message);
})) {
  if (!options) {
    return;
  }
  const presentKeys = removedKeys.filter((key) => key in options);
  if (!presentKeys.length) {
    return;
  }
  logWarning(
    `[Sentry] Removed in v11 and ignored: ${presentKeys.join(", ")}. Set bundler plugin options directly on the Sentry build options.`
  );
}

export { warnOnRemovedBuildOptions };
//# sourceMappingURL=warnOnRemovedBuildOptions.js.map
