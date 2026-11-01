import { getClient } from '../../currentScopes.js';
import { hasSpanStreamingEnabled } from '../../tracing/spans/hasSpanStreamingEnabled.js';
import { HTTP_SPAN_NAME_FALLBACK } from '../../tracing/spans/spanNames.js';
import { filterCollectedUrl } from '../../utils/data-collection/filterCollectedUrl.js';
import { getContentLengthFromHeaders } from '../../utils/request.js';
import { parseStringToURLObject, getHttpSpanDetailsFromUrlObject, isURLObjectRelative } from '../../utils/url.js';
import { getRequestUrlFromClientRequest } from './get-request-url.js';
import { USER_AGENT_ORIGINAL, SERVER_PORT, SERVER_ADDRESS, URL_FULL, SENTRY_KIND, SENTRY_OP, HTTP_RESPONSE_BODY_SIZE, NETWORK_TRANSPORT, NETWORK_PROTOCOL_VERSION, NETWORK_PROTOCOL_NAME, HTTP_RESPONSE_STATUS_CODE, NETWORK_PEER_PORT, NETWORK_PEER_ADDRESS, NETWORK_LOCAL_PORT, NETWORK_LOCAL_ADDRESS } from '@sentry/conventions/attributes';
import { HTTP_CLIENT } from '@sentry/conventions/op';

function getOutgoingRequestSpanData(request) {
  const url = getRequestUrlFromClientRequest(request);
  const urlObject = parseStringToURLObject(url);
  const [name, attributes] = getHttpSpanDetailsFromUrlObject(urlObject, "client", "auto.http.client", request);
  const userAgent = request.getHeader("user-agent");
  const client = getClient();
  const method = request.method?.toUpperCase();
  const domain = urlObject && !isURLObjectRelative(urlObject) ? urlObject.hostname : void 0;
  const streamedName = method ? domain ? `${method} ${domain}` : method : HTTP_SPAN_NAME_FALLBACK;
  const spanName = !!client && hasSpanStreamingEnabled(client) ? streamedName : name;
  return {
    name: spanName,
    attributes: {
      [SENTRY_OP]: HTTP_CLIENT,
      [SENTRY_KIND]: "client",
      [URL_FULL]: filterCollectedUrl(url),
      // The old `http.target` (path plus query) has no separate replacement here: `url.path`,
      // `url.query` and `http.request.method` all come from `attributes` below.
      [SERVER_ADDRESS]: request.host,
      [SERVER_PORT]: typeof request.port === "number" && !isNaN(request.port) ? request.port : void 0,
      [USER_AGENT_ORIGINAL]: userAgent || void 0,
      ...attributes
    },
    onlyIfParent: true
  };
}
function setIncomingResponseSpanData(response, span) {
  const { statusCode, statusMessage, httpVersion, socket } = response;
  const transport = httpVersion?.toUpperCase() !== "QUIC" ? "tcp" : "udp";
  span.setAttributes({
    [HTTP_RESPONSE_STATUS_CODE]: statusCode,
    [NETWORK_PROTOCOL_NAME]: "http",
    [NETWORK_PROTOCOL_VERSION]: httpVersion,
    [NETWORK_TRANSPORT]: transport,
    "http.response.status_text": statusMessage?.toUpperCase(),
    [HTTP_RESPONSE_BODY_SIZE]: getContentLengthFromHeaders(response.headers),
    ...getSocketAttrs(socket)
  });
}
function getSocketAttrs(socket) {
  if (!socket) return {};
  const { localAddress, localPort, remoteAddress, remotePort } = socket;
  return {
    [NETWORK_LOCAL_ADDRESS]: localAddress,
    [NETWORK_LOCAL_PORT]: localPort,
    [NETWORK_PEER_ADDRESS]: remoteAddress,
    [NETWORK_PEER_PORT]: remotePort
  };
}

export { getOutgoingRequestSpanData, setIncomingResponseSpanData };
//# sourceMappingURL=get-outgoing-span-data.js.map
