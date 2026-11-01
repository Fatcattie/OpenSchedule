import { getClient, getIsolationScope } from './currentScopes.js';
import { DEBUG_BUILD } from './debug-build.js';
import { consoleSandbox } from './utils/debug-logger.js';
import { safeCallback } from './utils/safeCallback.js';
import { dateTimestampInSeconds } from './utils/time.js';

const DEFAULT_BREADCRUMBS = 100;
function addBreadcrumb(breadcrumb, hint) {
  const client = getClient();
  const isolationScope = getIsolationScope();
  if (!client) return;
  const { beforeBreadcrumb = null, maxBreadcrumbs = DEFAULT_BREADCRUMBS } = client.getOptions();
  if (maxBreadcrumbs <= 0) return;
  const timestamp = dateTimestampInSeconds();
  const mergedBreadcrumb = { timestamp, ...breadcrumb };
  const finalBreadcrumb = beforeBreadcrumb ? safeCallback(
    DEBUG_BUILD ? "The `beforeBreadcrumb` callback threw an error, dropping the breadcrumb:" : "",
    () => consoleSandbox(() => beforeBreadcrumb(mergedBreadcrumb, hint)),
    () => null
  ) : mergedBreadcrumb;
  if (finalBreadcrumb === null) return;
  if (client.emit) {
    client.emit("beforeAddBreadcrumb", finalBreadcrumb, hint);
  }
  isolationScope.addBreadcrumb(finalBreadcrumb, maxBreadcrumbs);
}

export { addBreadcrumb };
//# sourceMappingURL=breadcrumbs.js.map
