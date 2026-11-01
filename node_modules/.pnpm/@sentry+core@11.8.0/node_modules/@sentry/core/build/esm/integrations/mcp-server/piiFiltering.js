import { CLIENT_ADDRESS, CLIENT_PORT, MCP_RESOURCE_URI } from '@sentry/conventions/attributes';

const NETWORK_PII_ATTRIBUTES = /* @__PURE__ */ new Set([CLIENT_ADDRESS, CLIENT_PORT, MCP_RESOURCE_URI]);
function isNetworkPiiAttribute(key) {
  return NETWORK_PII_ATTRIBUTES.has(key);
}
function filterMcpPiiFromSpanData(spanData, userInfo) {
  if (userInfo) {
    return spanData;
  }
  return Object.entries(spanData).reduce(
    (acc, [key, value]) => {
      if (!isNetworkPiiAttribute(key)) {
        acc[key] = value;
      }
      return acc;
    },
    {}
  );
}

export { filterMcpPiiFromSpanData };
//# sourceMappingURL=piiFiltering.js.map
