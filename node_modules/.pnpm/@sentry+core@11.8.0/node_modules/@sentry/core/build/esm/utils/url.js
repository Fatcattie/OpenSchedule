import { HTTP_ROUTE, URL_TEMPLATE, HTTP_REQUEST_METHOD, URL_FULL, URL_QUERY, URL_FRAGMENT, URL_PATH, URL_PORT, URL_SCHEME, SERVER_ADDRESS, URL_DOMAIN, SENTRY_SEGMENT_NAME_SOURCE, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { filterCollectedUrl, filterCollectedUrlQuery } from './data-collection/filterCollectedUrl.js';

const DEFAULT_BASE_URL = "thismessage:/";
function isURLObjectRelative(url) {
  return "isRelative" in url;
}
function parseStringToURLObject(url, urlBase) {
  const isRelative = url.indexOf("://") <= 0 && url.indexOf("//") !== 0;
  const base = urlBase ?? (isRelative ? DEFAULT_BASE_URL : void 0);
  try {
    if ("canParse" in URL && !URL.canParse(url, base)) {
      return void 0;
    }
    const fullUrlObject = new URL(url, base);
    if (isRelative) {
      return {
        isRelative,
        pathname: fullUrlObject.pathname,
        search: fullUrlObject.search,
        hash: fullUrlObject.hash
      };
    }
    return fullUrlObject;
  } catch {
  }
  return void 0;
}
function getSanitizedUrlStringFromUrlObject(url) {
  if (isURLObjectRelative(url)) {
    return url.pathname;
  }
  const newUrl = new URL(url);
  newUrl.search = "";
  newUrl.hash = "";
  if (["80", "443"].includes(newUrl.port)) {
    newUrl.port = "";
  }
  if (newUrl.password) {
    newUrl.password = "%filtered%";
  }
  if (newUrl.username) {
    newUrl.username = "%filtered%";
  }
  return newUrl.toString();
}
function getUrlQuery(query) {
  return query?.replace(/^\?/, "") || void 0;
}
function getUrlFragment(fragment) {
  return fragment?.replace(/^#/, "") || void 0;
}
function getUrlDomain(url, base) {
  try {
    return new URL(url, base).hostname || void 0;
  } catch {
    return void 0;
  }
}
function getHttpSpanNameFromUrlObject(urlObject, kind, request, routeName) {
  const method = request?.method?.toUpperCase() ?? "GET";
  const route = routeName ? routeName : urlObject ? kind === "client" ? getSanitizedUrlStringFromUrlObject(urlObject) : urlObject.pathname : "/";
  return `${method} ${route}`;
}
function getHttpSpanDetailsFromUrlObject(urlObject, kind, spanOrigin, request, routeName, client) {
  const attributes = {
    [SENTRY_ORIGIN]: spanOrigin
  };
  let nameSource = "url";
  if (routeName) {
    attributes[kind === "server" ? HTTP_ROUTE : URL_TEMPLATE] = routeName;
    nameSource = "route";
  }
  if (request?.method) {
    attributes[HTTP_REQUEST_METHOD] = request.method.toUpperCase();
  }
  if (urlObject) {
    attributes[URL_FULL] = filterCollectedUrl(
      isURLObjectRelative(urlObject) ? getSanitizedUrlStringFromUrlObject(urlObject) : urlObject.href,
      client
    );
    attributes[URL_QUERY] = filterCollectedUrlQuery(getUrlQuery(urlObject.search), client);
    attributes[URL_FRAGMENT] = getUrlFragment(urlObject.hash);
    if (urlObject.pathname) {
      attributes[URL_PATH] = urlObject.pathname;
      if (urlObject.pathname === "/") {
        nameSource = "route";
      }
    }
    if (!isURLObjectRelative(urlObject)) {
      if (urlObject.port) {
        attributes[URL_PORT] = urlObject.port;
      }
      if (urlObject.protocol) {
        attributes[URL_SCHEME] = urlObject.protocol;
      }
      if (urlObject.hostname) {
        attributes[kind === "server" ? SERVER_ADDRESS : URL_DOMAIN] = urlObject.hostname;
      }
    }
  }
  if (kind === "server") {
    attributes[SENTRY_SEGMENT_NAME_SOURCE] = nameSource;
  }
  return [getHttpSpanNameFromUrlObject(urlObject, kind, request, routeName), attributes];
}
function parseUrl(url) {
  if (!url) {
    return {};
  }
  const match = url.match(/^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/);
  if (!match) {
    return {};
  }
  const query = match[6] || "";
  const fragment = match[8] || "";
  return {
    host: match[4],
    path: match[5],
    protocol: match[2],
    search: query,
    hash: fragment,
    relative: match[5] + query + fragment
    // everything minus origin
  };
}
function stripUrlQueryAndFragment(urlPath) {
  return urlPath.split(/[?#]/, 1)[0];
}
function getSanitizedUrlString(url) {
  const { protocol, host, path } = url;
  const filteredHost = host?.replace(/^.*@/, "[filtered]:[filtered]@").replace(/(:80)$/, "").replace(/(:443)$/, "") || "";
  return `${protocol ? `${protocol}://` : ""}${filteredHost}${path || ""}`;
}
function stripDataUrlContent(url, includeDataPrefix = true) {
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;,]+)/);
    const mimeType = match ? match[1] : "text/plain";
    const isBase64 = url.includes(";base64,");
    const dataStart = url.indexOf(",");
    let dataPrefix = "";
    if (includeDataPrefix && dataStart !== -1) {
      const data = url.slice(dataStart + 1);
      dataPrefix = data.length > 10 ? `${data.slice(0, 10)}... [truncated]` : data;
    }
    return `data:${mimeType}${isBase64 ? ",base64" : ""}${dataPrefix ? `,${dataPrefix}` : ""}`;
  }
  return url;
}

export { getHttpSpanDetailsFromUrlObject, getSanitizedUrlString, getSanitizedUrlStringFromUrlObject, getUrlDomain, getUrlFragment, getUrlQuery, isURLObjectRelative, parseStringToURLObject, parseUrl, stripDataUrlContent, stripUrlQueryAndFragment };
//# sourceMappingURL=url.js.map
