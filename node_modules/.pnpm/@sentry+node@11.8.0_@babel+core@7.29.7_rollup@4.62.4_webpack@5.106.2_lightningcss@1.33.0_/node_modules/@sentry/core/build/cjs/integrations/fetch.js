Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const attributes = require('@sentry/conventions/attributes');
const breadcrumbs = require('../breadcrumbs.js');
const currentScopes = require('../currentScopes.js');
const fetch$1 = require('../fetch.js');
const integration = require('../integration.js');
const fetch = require('../instrument/fetch.js');
const breadcrumbLogLevel = require('../utils/breadcrumb-log-level.js');
const filterCollectedUrl = require('../utils/data-collection/filterCollectedUrl.js');
const isSentryRequestUrl = require('../utils/isSentryRequestUrl.js');
const lru = require('../utils/lru.js');
const tracePropagationTargets = require('../utils/tracePropagationTargets.js');
const url = require('../utils/url.js');

function createFetchIntegration({
  name,
  spanOrigin
}) {
  const spans = {};
  const configs = /* @__PURE__ */ new WeakMap();
  const integration$1 = ((options = {}) => {
    return {
      name,
      setupOnce() {
        fetch.addFetchInstrumentationHandler((handlerData) => {
          const client = currentScopes.getClient();
          const config = client && configs.get(client);
          if (!client || !config) {
            return;
          }
          if (isSentryRequestUrl.isSentryRequestUrl(handlerData.fetchData.url, client)) {
            return;
          }
          const { propagateTraceparent } = client.getOptions();
          fetch$1.instrumentFetchRequest(handlerData, config.shouldCreateSpan, config.shouldAttachTraceData, spans, {
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
  return integration.defineIntegration(integration$1);
}
function resolveConfig(client, options) {
  const { breadcrumbs = true, shouldCreateSpanForRequest, tracePropagation = true } = options;
  const createSpanUrlMap = new lru.LRUMap(100);
  const headersUrlMap = new lru.LRUMap(100);
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
      return tracePropagationTargets.shouldPropagateTraceForUrl(url, client.getOptions().tracePropagationTargets, headersUrlMap);
    }
  };
}
function createBreadcrumb(handlerData, client) {
  const { startTimestamp, endTimestamp } = handlerData;
  if (!endTimestamp) {
    return;
  }
  const parsedUrl = url.parseUrl(handlerData.fetchData.url);
  const breadcrumbData = {
    method: handlerData.fetchData.method,
    url: url.getSanitizedUrlString(parsedUrl),
    [attributes.URL_QUERY]: filterCollectedUrl.filterCollectedUrlQuery(url.getUrlQuery(parsedUrl.search), client),
    [attributes.URL_FRAGMENT]: url.getUrlFragment(parsedUrl.hash)
  };
  if (handlerData.error) {
    const hint = {
      data: handlerData.error,
      input: handlerData.args,
      startTimestamp,
      endTimestamp
    };
    breadcrumbs.addBreadcrumb(
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
    const level = breadcrumbLogLevel.getBreadcrumbLogLevelFromHttpStatusCode(breadcrumbData.status_code);
    breadcrumbs.addBreadcrumb(
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

exports.createFetchIntegration = createFetchIntegration;
//# sourceMappingURL=fetch.js.map
