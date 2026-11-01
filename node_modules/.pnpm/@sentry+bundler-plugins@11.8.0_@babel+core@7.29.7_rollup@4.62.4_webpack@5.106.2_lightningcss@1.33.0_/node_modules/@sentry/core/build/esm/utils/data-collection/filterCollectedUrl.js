import { getClient } from '../../currentScopes.js';
import { filterQueryParams } from './filterQueryParams.js';
import { filterUrlQuery } from './filterUrlQuery.js';

function urlQueryParamsBehavior(client) {
  return (client ?? getClient())?.getDataCollectionOptions().urlQueryParams ?? true;
}
function filterCollectedUrl(url, client) {
  return url === void 0 ? void 0 : filterUrlQuery(url, urlQueryParamsBehavior(client));
}
function filterCollectedUrlQuery(query, client) {
  return query ? filterQueryParams(query, urlQueryParamsBehavior(client)) : void 0;
}

export { filterCollectedUrl, filterCollectedUrlQuery };
//# sourceMappingURL=filterCollectedUrl.js.map
