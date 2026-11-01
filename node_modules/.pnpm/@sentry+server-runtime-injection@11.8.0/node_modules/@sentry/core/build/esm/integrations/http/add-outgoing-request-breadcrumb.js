import { URL_FRAGMENT, URL_QUERY, HTTP_REQUEST_METHOD } from '@sentry/conventions/attributes';
import { addBreadcrumb } from '../../breadcrumbs.js';
import { getBreadcrumbLogLevelFromHttpStatusCode } from '../../utils/breadcrumb-log-level.js';
import { filterCollectedUrlQuery } from '../../utils/data-collection/filterCollectedUrl.js';
import { parseUrl, getUrlFragment, getUrlQuery, getSanitizedUrlString } from '../../utils/url.js';
import { getRequestUrlFromClientRequest } from './get-request-url.js';

function addOutgoingRequestBreadcrumb(request, response) {
  const url = getRequestUrlFromClientRequest(request);
  const parsedUrl = parseUrl(url);
  const statusCode = response?.statusCode;
  const level = getBreadcrumbLogLevelFromHttpStatusCode(statusCode);
  addBreadcrumb(
    {
      category: "http",
      data: {
        status_code: statusCode,
        url: getSanitizedUrlString(parsedUrl),
        // eslint-disable-next-line typescript/no-deprecated
        [HTTP_REQUEST_METHOD]: request.method || "GET",
        [URL_QUERY]: filterCollectedUrlQuery(getUrlQuery(parsedUrl.search)),
        [URL_FRAGMENT]: getUrlFragment(parsedUrl.hash)
      },
      type: "http",
      level
    },
    {
      event: "response",
      request,
      response
    }
  );
}

export { addOutgoingRequestBreadcrumb };
//# sourceMappingURL=add-outgoing-request-breadcrumb.js.map
