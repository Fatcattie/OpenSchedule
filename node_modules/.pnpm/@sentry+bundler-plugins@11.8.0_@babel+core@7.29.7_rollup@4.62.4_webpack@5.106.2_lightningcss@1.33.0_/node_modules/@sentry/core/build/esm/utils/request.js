import { DEBUG_BUILD } from '../debug-build.js';
import { parseCookieHeader } from './cookie.js';
import { debug } from './debug-logger.js';
import { FILTERED_VALUE, SENSITIVE_COOKIE_NAME_SNIPPETS } from './data-collection/filtering-snippets.js';
import { shouldFilterDataKey } from './data-collection/filterKeyValueData.js';
import { safeUnref } from './timer.js';
import { getUrlQuery } from './url.js';

const MAX_BODY_BYTE_LENGTH = 1024 * 1024;
const TEXT_CONTENT_TYPES = [
  "text/",
  "application/json",
  "application/x-www-form-urlencoded",
  "application/xml",
  "application/graphql"
];
function getMaxBodyByteLength(maxRequestBodySize) {
  if (maxRequestBodySize === "small") return 1e3;
  if (maxRequestBodySize === "medium") return 1e4;
  return MAX_BODY_BYTE_LENGTH;
}
function winterCGHeadersToDict(winterCGHeaders) {
  const headers = {};
  try {
    winterCGHeaders.forEach((value, key) => {
      if (typeof value === "string") {
        headers[key] = value;
      }
    });
  } catch {
  }
  return headers;
}
function headersToDict(reqHeaders) {
  const headers = /* @__PURE__ */ Object.create(null);
  try {
    Object.entries(reqHeaders).forEach(([key, value]) => {
      if (typeof value === "string") {
        headers[key] = value;
      } else if (typeof value === "number") {
        headers[key] = String(value);
      }
    });
  } catch {
  }
  return headers;
}
function winterCGRequestToRequestData(req) {
  const headers = winterCGHeadersToDict(req.headers);
  return {
    method: req.method,
    url: req.url,
    query_string: extractQueryParamsFromUrl(req.url),
    headers
    // TODO: Can we extract body data from the request?
  };
}
function isTextualContentType(contentType) {
  if (!contentType) {
    return false;
  }
  const lowerContentType = contentType.toLowerCase();
  return TEXT_CONTENT_TYPES.some((type) => lowerContentType.includes(type));
}
async function captureBodyFromWinterCGRequest(request, isolationScope, maxRequestBodySize) {
  try {
    const contentType = request.headers.get("content-type");
    if (!isTextualContentType(contentType)) {
      DEBUG_BUILD && debug.log("Skipping body capture for non-textual content type:", contentType);
      return;
    }
    if (!request.body) {
      return;
    }
    const contentLength = request.headers.get("content-length");
    const maxBodySize = getMaxBodyByteLength(maxRequestBodySize);
    if (contentLength) {
      const length = parseInt(contentLength, 10);
      if (!isNaN(length) && length > MAX_BODY_BYTE_LENGTH) {
        DEBUG_BUILD && debug.log("Skipping body capture: body too large", length);
        return;
      }
    }
    const clonedRequest = request.clone();
    const bodyPromise = clonedRequest.text();
    const timeoutPromise = new Promise((resolve) => {
      safeUnref(setTimeout(() => resolve(null), 2e3));
    });
    const body = await Promise.race([bodyPromise, timeoutPromise]);
    if (body === null) {
      DEBUG_BUILD && debug.log("Timeout reading request body");
      return;
    }
    if (!body) {
      return;
    }
    const encoder = new TextEncoder();
    const bytes = encoder.encode(body);
    const bodyByteLength = bytes.length;
    let truncatedBody;
    if (bodyByteLength > maxBodySize) {
      const decoder = new TextDecoder();
      truncatedBody = `${decoder.decode(bytes.slice(0, maxBodySize - 3))}...`;
    } else {
      truncatedBody = body;
    }
    isolationScope.setSDKProcessingMetadata({ normalizedRequest: { data: truncatedBody } });
    DEBUG_BUILD && debug.log("Captured request body:", bodyByteLength, "bytes");
  } catch (error) {
    DEBUG_BUILD && debug.error("Error capturing request body:", error);
  }
}
function httpRequestToRequestData(request) {
  const headers = request.headers || {};
  const forwardedHost = typeof headers["x-forwarded-host"] === "string" ? headers["x-forwarded-host"] : void 0;
  const host = forwardedHost || (typeof headers.host === "string" ? headers.host : void 0);
  const forwardedProto = typeof headers["x-forwarded-proto"] === "string" ? headers["x-forwarded-proto"] : void 0;
  const protocol = forwardedProto || request.protocol || (request.socket?.encrypted ? "https" : "http");
  const url = request.url || "";
  const absoluteUrl = getAbsoluteUrl({
    url,
    host,
    protocol
  });
  const data = request.body || void 0;
  const cookies = request.cookies;
  return {
    url: absoluteUrl,
    method: request.method,
    query_string: extractQueryParamsFromUrl(url),
    headers: headersToDict(headers),
    cookies,
    data
  };
}
function getAbsoluteUrl({
  url,
  protocol,
  host
}) {
  if (url?.startsWith("http")) {
    return url;
  }
  if (url && host) {
    return `${protocol}://${host}${url}`;
  }
  return void 0;
}
function httpHeadersToSpanAttributes(headers, dataCollection, lifecycle = "request") {
  const headerBehavior = lifecycle === "request" ? dataCollection.httpHeaders.request : dataCollection.httpHeaders.response;
  const cookieBehavior = dataCollection.cookies;
  const prefix = `http.${lifecycle}.header.`;
  const spanAttributes = {};
  try {
    const regularHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value == null) {
        continue;
      }
      const lowerKey = key.toLowerCase();
      const isCookieHeader = lowerKey === "cookie" || lowerKey === "set-cookie";
      if (isCookieHeader) {
        if (cookieBehavior === false) {
          continue;
        }
        const cookies = parseCookieHeader(value, lowerKey);
        spanAttributes[`${prefix}${lowerKey}`] = cookies.length ? filterCookiePairs(cookies, cookieBehavior) : [FILTERED_VALUE];
      } else {
        if (headerBehavior === false) {
          continue;
        }
        if (Array.isArray(value)) {
          regularHeaders[lowerKey] = value.filter((v) => v != null).map((v) => String(v));
        } else if (typeof value === "string") {
          regularHeaders[lowerKey] = [value];
        }
      }
    }
    if (headerBehavior !== false) {
      for (const [headerKey, headerValues] of Object.entries(regularHeaders)) {
        spanAttributes[`${prefix}${headerKey}`] = shouldFilterDataKey(headerKey, headerBehavior) ? [FILTERED_VALUE] : headerValues;
      }
    }
  } catch {
  }
  return spanAttributes;
}
function filterCookiePairs(cookies, cookieBehavior) {
  return cookies.map(([cookieKey, cookieValue]) => {
    if (cookieKey === "") {
      return FILTERED_VALUE;
    }
    return shouldFilterDataKey(cookieKey, cookieBehavior, SENSITIVE_COOKIE_NAME_SNIPPETS) ? `${cookieKey}=${FILTERED_VALUE}` : `${cookieKey}=${cookieValue}`;
  });
}
function extractQueryParamsFromUrl(url) {
  if (!url) {
    return;
  }
  try {
    return getUrlQuery(new URL(url, "http://s.io").search);
  } catch {
    return void 0;
  }
}
function getContentLengthFromHeaders(headers) {
  const contentLength = headers["content-length"];
  if (typeof contentLength !== "string") {
    return void 0;
  }
  const length = parseInt(contentLength, 10);
  return length >= 0 ? length : void 0;
}

export { MAX_BODY_BYTE_LENGTH, captureBodyFromWinterCGRequest, extractQueryParamsFromUrl, filterCookiePairs, getContentLengthFromHeaders, getMaxBodyByteLength, headersToDict, httpHeadersToSpanAttributes, httpRequestToRequestData, winterCGHeadersToDict, winterCGRequestToRequestData };
//# sourceMappingURL=request.js.map
