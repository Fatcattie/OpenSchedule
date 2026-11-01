import { MCP_PROTOCOL_VERSION, CLIENT_PORT, CLIENT_ADDRESS, MCP_SESSION_ID, NETWORK_PROTOCOL_VERSION, NETWORK_TRANSPORT, MCP_TRANSPORT, MCP_CLIENT_NAME, MCP_CLIENT_TITLE, MCP_CLIENT_VERSION, MCP_SERVER_NAME, MCP_SERVER_TITLE, MCP_SERVER_VERSION } from '@sentry/conventions/attributes';
import { getProtocolVersionForTransport, getClientInfoForTransport, getSessionDataForTransport } from './sessionManagement.js';
import { isValidContentItem } from './validation.js';

const MCP_PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion";
const MCP_CLIENT_INFO_META_KEY = "io.modelcontextprotocol/clientInfo";
const MCP_SERVER_INFO_META_KEY = "io.modelcontextprotocol/serverInfo";
function extractPartyInfo(obj) {
  const partyInfo = {};
  if (isValidContentItem(obj)) {
    if (typeof obj.name === "string") {
      partyInfo.name = obj.name;
    }
    if (typeof obj.title === "string") {
      partyInfo.title = obj.title;
    }
    if (typeof obj.version === "string") {
      partyInfo.version = obj.version;
    }
  }
  return partyInfo;
}
function extractSessionDataFromInitializeRequest(request) {
  const sessionData = {};
  if (isValidContentItem(request.params)) {
    if (typeof request.params.protocolVersion === "string") {
      sessionData.protocolVersion = request.params.protocolVersion;
    }
    if (request.params.clientInfo) {
      sessionData.clientInfo = extractPartyInfo(request.params.clientInfo);
    }
  }
  return sessionData;
}
function extractSessionDataFromMessage(message) {
  const sessionData = {};
  if (isValidContentItem(message.params)) {
    if (isValidContentItem(message.params._meta)) {
      const meta = message.params._meta;
      if (typeof meta[MCP_PROTOCOL_VERSION_META_KEY] === "string") {
        sessionData.protocolVersion = meta[MCP_PROTOCOL_VERSION_META_KEY];
      }
      if (meta[MCP_CLIENT_INFO_META_KEY]) {
        sessionData.clientInfo = extractPartyInfo(meta[MCP_CLIENT_INFO_META_KEY]);
      }
    }
  }
  return sessionData;
}
function extractSessionDataFromInitializeResponse(result) {
  const sessionData = {};
  if (isValidContentItem(result)) {
    if (typeof result.protocolVersion === "string") {
      sessionData.protocolVersion = result.protocolVersion;
    }
    if (result.serverInfo) {
      sessionData.serverInfo = extractPartyInfo(result.serverInfo);
    }
  }
  return sessionData;
}
function extractSessionDataFromResponse(result) {
  const sessionData = {};
  if (isValidContentItem(result)) {
    if (isValidContentItem(result._meta) && result._meta[MCP_SERVER_INFO_META_KEY]) {
      sessionData.serverInfo = extractPartyInfo(result._meta[MCP_SERVER_INFO_META_KEY]);
    }
  }
  return sessionData;
}
function getClientAttributes(transport) {
  const clientInfo = getClientInfoForTransport(transport);
  const attributes = {};
  if (clientInfo?.name) {
    attributes[MCP_CLIENT_NAME] = clientInfo.name;
  }
  if (clientInfo?.title) {
    attributes[MCP_CLIENT_TITLE] = clientInfo.title;
  }
  if (clientInfo?.version) {
    attributes[MCP_CLIENT_VERSION] = clientInfo.version;
  }
  return attributes;
}
function buildClientAttributesFromInfo(clientInfo) {
  const attributes = {};
  if (clientInfo?.name) {
    attributes[MCP_CLIENT_NAME] = clientInfo.name;
  }
  if (clientInfo?.title) {
    attributes[MCP_CLIENT_TITLE] = clientInfo.title;
  }
  if (clientInfo?.version) {
    attributes[MCP_CLIENT_VERSION] = clientInfo.version;
  }
  return attributes;
}
function getServerAttributes(transport) {
  const serverInfo = getSessionDataForTransport(transport)?.serverInfo;
  const attributes = {};
  if (serverInfo?.name) {
    attributes[MCP_SERVER_NAME] = serverInfo.name;
  }
  if (serverInfo?.title) {
    attributes[MCP_SERVER_TITLE] = serverInfo.title;
  }
  if (serverInfo?.version) {
    attributes[MCP_SERVER_VERSION] = serverInfo.version;
  }
  return attributes;
}
function buildServerAttributesFromInfo(serverInfo) {
  const attributes = {};
  if (serverInfo?.name) {
    attributes[MCP_SERVER_NAME] = serverInfo.name;
  }
  if (serverInfo?.title) {
    attributes[MCP_SERVER_TITLE] = serverInfo.title;
  }
  if (serverInfo?.version) {
    attributes[MCP_SERVER_VERSION] = serverInfo.version;
  }
  return attributes;
}
function extractClientInfo(extra) {
  return {
    address: extra?.requestInfo?.remoteAddress || extra?.clientAddress || extra?.request?.ip || extra?.request?.connection?.remoteAddress,
    port: extra?.requestInfo?.remotePort || extra?.clientPort || extra?.request?.connection?.remotePort
  };
}
function getTransportTypes(transport) {
  if (!transport?.constructor) {
    return { mcpTransport: "unknown", networkTransport: "unknown" };
  }
  const transportName = typeof transport.constructor?.name === "string" ? transport.constructor.name : "unknown";
  let networkTransport = "unknown";
  const lowerTransportName = transportName.toLowerCase();
  if (lowerTransportName.includes("stdio")) {
    networkTransport = "pipe";
  } else if (lowerTransportName.includes("http") || lowerTransportName.includes("sse")) {
    networkTransport = "tcp";
  }
  return {
    mcpTransport: transportName,
    networkTransport
  };
}
function buildTransportAttributes(transport, extra, message) {
  const messageData = message && extractSessionDataFromMessage(message);
  const hasRequestMetadata = messageData?.protocolVersion !== void 0 || messageData?.clientInfo !== void 0;
  const sessionId = !hasRequestMetadata && transport && "sessionId" in transport ? transport.sessionId : void 0;
  const clientInfo = extra ? extractClientInfo(extra) : {};
  const { mcpTransport, networkTransport } = getTransportTypes(transport);
  const clientAttributes = hasRequestMetadata ? buildClientAttributesFromInfo(messageData?.clientInfo) : getClientAttributes(transport);
  const serverAttributes = hasRequestMetadata ? {} : getServerAttributes(transport);
  const protocolVersion = hasRequestMetadata ? messageData?.protocolVersion : getProtocolVersionForTransport(transport);
  const attributes = {
    ...sessionId && { [MCP_SESSION_ID]: sessionId },
    ...clientInfo.address && { [CLIENT_ADDRESS]: clientInfo.address },
    ...clientInfo.port && { [CLIENT_PORT]: clientInfo.port },
    [MCP_TRANSPORT]: mcpTransport,
    [NETWORK_TRANSPORT]: networkTransport,
    [NETWORK_PROTOCOL_VERSION]: "2.0",
    ...protocolVersion && { [MCP_PROTOCOL_VERSION]: protocolVersion },
    ...clientAttributes,
    ...serverAttributes
  };
  return attributes;
}

export { buildClientAttributesFromInfo, buildServerAttributesFromInfo, buildTransportAttributes, extractClientInfo, extractSessionDataFromInitializeRequest, extractSessionDataFromInitializeResponse, extractSessionDataFromMessage, extractSessionDataFromResponse, getClientAttributes, getServerAttributes, getTransportTypes };
//# sourceMappingURL=sessionExtraction.js.map
