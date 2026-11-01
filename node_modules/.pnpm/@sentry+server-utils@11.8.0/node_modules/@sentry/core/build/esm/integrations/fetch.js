import { URL_FRAGMENT, URL_QUERY } from '@sentry/conventions/attributes';
import { addBreadcrumb } from '../breadcrumbs.js';
import { getClient } from '../currentScopes.js';
import { instrumentFetchRequest } from '../fetch.js';
import { defineIntegration } from '../integration.js';
import { addFetchInstrumentationHandler } from '../instrument/fetch.js';
import { getBreadcrumbLogLevelFromHttpStatusCode } from '../utils/breadcrumb-log-level.js';
import { filterCollectedUrlQuery } from '../utils/data-collection/filterCollectedUrl.js';
import { isSentryRequestUrl } from '../utils/isSentryRequestUrl.js';
import { LRUMap } from '../utils/lru.js';
import { shouldPropagateTraceForUrl } from '../utils/tracePropagationTargets.js';
import { parseUrl, getUrlFragment, getUrlQuery, getSanitizedUrlString } from '../utils/url.js';

function createFetchIntegration({
  name,
  spanOrigin
}) {
  const spans = {};
  const configs = /* @__PURE__ */ new WeakMap();
  const integration = ((options = {}) => {
    return {
      name,
      setupOnce() {
        addFetchInstrumentationHandler((handlerData) => {
          const client = getClient();
          const config = client && configs.get(client);
          if (!client || !config) {
            return;
          }
          if (isSentryRequestUrl(handlerData.fetchData.url, client)) {
            return;
          }
          const { propagateTraceparent } = client.getOptions();
          instrumentFetchRequest(handlerData, config.shouldCreateSpan, config.shouldAttachTraceData, spans, {
            spanOrigin,
            propagateTraceparent
          });
          if (config.breadcrumbs) {
            createBreadcrumb(handlerData, client);
          }
        });
      },
      setup(client) {
        configs.set(client, resolveConfig(client, options));
      }
    };
  });
  return defineIntegration(integration);
}
function resolveConfig(client, options) {
  const { breadcrumbs = true, shouldCreateSpanForRequest, tracePropagation = true } = options;
  const createSpanUrlMap = new LRUMap(100);
  const headersUrlMap = new LRUMap(100);
  return {
    breadcrumbs,
    shouldCreateSpan(url) {
      if (shouldCreateSpanForRequest === void 0) {
        return true;
      }
      const cachedDecision = createSpanUrlMap.get(url);
      if (cachedDecision !== void 0) {
        return cachedDecision;
      }
      const decision = shouldCreateSpanForRequest(url);
      createSpanUrlMap.set(url, decision);
      return decision;
    },
    shouldAttachTraceData(url) {
      if (!tracePropagation) {
        return false;
      }
      return shouldPropagateTraceForUrl(url, client.getOptions().tracePropagationTargets, headersUrlMap);
    }
  };
}
function createBreadcrumb(handlerData, client) {
  const { startTimestamp, endTimestamp } = handlerData;
  if (!endTimestamp) {
    return;
  }
  const parsedUrl = parseUrl(handlerData.fetchData.url);
  const breadcrumbData = {
    method: handlerData.fetchData.method,
    url: getSanitizedUrlString(parsedUrl),
    [URL_QUERY]: filterCollectedUrlQuery(getUrlQuery(parsedUrl.search), client),
    [URL_FRAGMENT]: getUrlFragment(parsedUrl.hash)
  };
  if (handlerData.error) {
    const hint = {
      data: handlerData.error,
      input: handlerData.args,
      startTimestamp,
      endTimestamp
    };
    addBreadcrumb(
      {
        category: "fetch",
        data: breadcrumbData,
        level: "error",
        type: "http"
      },
      hint
    );
  } else {
    const response = handlerData.response;
    breadcrumbData.request_body_size = handlerData.fetchData.request_body_size;
    breadcrumbData.response_body_size = handlerData.fetchData.response_body_size;
    breadcrumbData.status_code = response?.status;
    const hint = {
      input: handlerData.args,
      response,
      startTimestamp,
      endTimestamp
    };
    const level = getBreadcrumbLogLevelFromHttpStatusCode(breadcrumbData.status_code);
    addBreadcrumb(
      {
        category: "fetch",
        data: breadcrumbData,
        type: "http",
        level
      },
      hint
    );
  }
}

export { createFetchIntegration };
//# sourceMappingURL=fetch.js.map
