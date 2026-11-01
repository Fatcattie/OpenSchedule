Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const currentScopes = require('./currentScopes.js');
const debugBuild = require('./debug-build.js');
const debugLogger = require('./utils/debug-logger.js');
const safeCallback = require('./utils/safeCallback.js');
const time = require('./utils/time.js');

const DEFAULT_BREADCRUMBS = 100;
function addBreadcrumb(breadcrumb, hint) {
  const client = currentScopes.getClient();
  const isolationScope = currentScopes.getIsolationScope();
  if (!client) return;
  const { beforeBreadcrumb = null, maxBreadcrumbs = DEFAULT_BREADCRUMBS } = client.getOptions();
  if (maxBreadcrumbs <= 0) return;
  const timestamp = time.dateTimestampInSeconds();
  const mergedBreadcrumb = { timestamp, ...breadcrumb };
  const finalBreadcrumb = beforeBreadcrumb ? safeCallback.safeCallback(
    debugBuild.DEBUG_BUILD ? "The `beforeBreadcrumb` callback threw an error, dropping the breadcrumb:" : "",
    () => debugLogger.consoleSandbox(() => beforeBreadcrumb(mergedBreadcrumb, hint)),
    () => null
  ) : mergedBreadcrumb;
  if (finalBreadcrumb === null) return;
  if (client.emit) {
    client.emit("beforeAddBreadcrumb", finalBreadcrumb, hint);
  }
  isolationScope.addBreadcrumb(finalBreadcrumb, maxBreadcrumbs);
}

exports.addBreadcrumb = addBreadcrumb;
//# sourceMappingURL=breadcrumbs.js.map
