Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const currentScopes = require('../../currentScopes.js');
const filterQueryParams = require('./filterQueryParams.js');
const filterUrlQuery = require('./filterUrlQuery.js');

function urlQueryParamsBehavior(client) {
  return (client ?? currentScopes.getClient())?.getDataCollectionOptions().urlQueryParams ?? true;
}
function filterCollectedUrl(url, client) {
  return url === void 0 ? void 0 : filterUrlQuery.filterUrlQuery(url, urlQueryParamsBehavior(client));
}
function filterCollectedUrlQuery(query, client) {
  return query ? filterQueryParams.filterQueryParams(query, urlQueryParamsBehavior(client)) : void 0;
}

exports.filterCollectedUrl = filterCollectedUrl;
exports.filterCollectedUrlQuery = filterCollectedUrlQuery;
//# sourceMappingURL=filterCollectedUrl.js.map
