import { ipHeaderNames, getClientIPAddress as getClientIPAddress$1 } from '../vendor/getIpAddress.js';

const IP_HEADER_NAMES = new Set(ipHeaderNames.map((name) => name.toLowerCase()));
function getClientIPAddress(headers) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    const name = key.toLowerCase();
    if (value == null || !IP_HEADER_NAMES.has(name)) {
      continue;
    }
    const joined = Array.isArray(value) ? value.join(",") : value;
    normalized[key] = name === "forwarded" ? normalizeForwardedHeader(joined) : joined.split(",").map((ip) => stripPort(ip.trim())).join(",");
  }
  return getClientIPAddress$1(normalized);
}
function normalizeForwardedHeader(value) {
  const forPair = value.split(/[,;]/).map((part) => part.trim()).find((part) => part.slice(0, 4).toLowerCase() === "for=");
  return forPair ? `for=${stripPort(forPair.slice(4).replace(/^"(.*)"$/, "$1"))}` : "";
}
function stripPort(ip) {
  return ip.match(/^\[([^\]]+)\](?::\d+)?$/)?.[1] ?? ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)?.[1] ?? ip;
}

export { getClientIPAddress };
//# sourceMappingURL=clientIPAddress.js.map
