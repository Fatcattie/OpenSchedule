Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const url = require('./url.js');

const LOCAL_IPS = ["127.0.0.1", "::1"];
const LOCAL_DOMAINS = ["127.0.0.1", "localhost"];
const HOST_HEADERS = ["host", "x-forwarded-host"];
function isLocalhostRequest(request, ipAddress) {
  if (ipAddress && LOCAL_IPS.includes(ipAddress)) {
    return true;
  }
  const url$1 = request?.url ? url.parseStringToURLObject(request.url) : void 0;
  if (url$1 && !url.isURLObjectRelative(url$1)) {
    if (url$1.protocol === "file:") {
      return true;
    }
    if (LOCAL_DOMAINS.some((domain) => hostMatchesOrIsSubdomainOf(url$1.hostname, domain))) {
      return true;
    }
  }
  const headers = request?.headers;
  if (headers) {
    for (const [name, value] of Object.entries(headers)) {
      if (!HOST_HEADERS.includes(name.toLowerCase())) {
        continue;
      }
      const host = value?.split(":")[0];
      if (host && LOCAL_DOMAINS.includes(host)) {
        return true;
      }
    }
  }
  return false;
}
function hostMatchesOrIsSubdomainOf(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

exports.isLocalhostRequest = isLocalhostRequest;
//# sourceMappingURL=localhost.js.map
