Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const currentScopes = require('../../currentScopes.js');
const hasSpanStreamingEnabled = require('../../tracing/spans/hasSpanStreamingEnabled.js');
const spanNames = require('../../tracing/spans/spanNames.js');
const filterCollectedUrl = require('../../utils/data-collection/filterCollectedUrl.js');
const request = require('../../utils/request.js');
const url = require('../../utils/url.js');
const getRequestUrl = require('./get-request-url.js');
const attributes = require('@sentry/conventions/attributes');
const op = require('@sentry/conventions/op');

function getOutgoingRequestSpanData(request) {
  const url$1 = getRequestUrl.getRequestUrlFromClientRequest(request);
  const urlObject = url.parseStringToURLObject(url$1);
  const [name, attributes$1] = url.getHttpSpanDetailsFromUrlObject(urlObject, "client", "auto.http.client", request);
  const userAgent = request.getHeader("user-agent");
  const client = currentScopes.getClient();
  const method = request.method?.toUpperCase();
  const domain = urlObject && !url.isURLObjectRelative(urlObject) ? urlObject.hostname : void 0;
  const streamedName = method ? domain ? `${method} ${domain}` : method : spanNames.HTTP_SPAN_NAME_FALLBACK;
  const spanName = !!client && hasSpanStreamingEnabled.hasSpanStreamingEnabled(client) ? streamedName : name;
  return {
    name: spanName,
    attributes: {
      [attributes.SENTRY_OP]: op.HTTP_CLIENT,
      [attributes.SENTRY_KIND]: "client",
      [attributes.URL_FULL]: filterCollectedUrl.filterCollectedUrl(url$1),
      // The old `http.target` (path plus query) has no separate replacement here: `url.path`,
      // `url.query` and `http.request.method` all come from `attributes` below.
      [attributes.SERVER_ADDRESS]: request.host,
      [attributes.SERVER_PORT]: typeof request.port === "number" && !isNaN(request.port) ? request.port : void 0,
      [attributes.USER_AGENT_ORIGINAL]: userAgent || void 0,
      ...attributes$1
    },
    onlyIfParent: true
  };
}
function setIncomingResponseSpanData(response, span) {
  const { statusCode, statusMessage, httpVersion, socket } = response;
  const transport = httpVersion?.toUpperCase() !== "QUIC" ? "tcp" : "udp";
  span.setAttributes({
    [attributes.HTTP_RESPONSE_STATUS_CODE]: statusCode,
    [attributes.NETWORK_PROTOCOL_NAME]: "http",
    [attributes.NETWORK_PROTOCOL_VERSION]: httpVersion,
    [attributes.NETWORK_TRANSPORT]: transport,
    "http.response.status_text": statusMessage?.toUpperCase(),
    [attributes.HTTP_RESPONSE_BODY_SIZE]: request.getContentLengthFromHeaders(response.headers),
    ...getSocketAttrs(socket)
  });
}
function getSocketAttrs(socket) {
  if (!socket) return {};
  const { localAddress, localPort, remoteAddress, remotePort } = socket;
  return {
    [attributes.NETWORK_LOCAL_ADDRESS]: localAddress,
    [attributes.NETWORK_LOCAL_PORT]: localPort,
    [attributes.NETWORK_PEER_ADDRESS]: remoteAddress,
    [attributes.NETWORK_PEER_PORT]: remotePort
  };
}

exports.getOutgoingRequestSpanData = getOutgoingRequestSpanData;
exports.setIncomingResponseSpanData = setIncomingResponseSpanData;
//# sourceMappingURL=get-outgoing-span-data.js.map
