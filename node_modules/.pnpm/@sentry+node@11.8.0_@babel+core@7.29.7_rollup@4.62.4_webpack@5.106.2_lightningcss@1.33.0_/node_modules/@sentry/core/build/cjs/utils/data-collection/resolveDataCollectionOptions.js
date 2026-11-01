Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const DEFAULTS = {
  userInfo: true,
  cookies: true,
  httpHeaders: { request: true, response: true },
  httpBodies: ["incomingRequest", "outgoingRequest", "incomingResponse", "outgoingResponse"],
  urlQueryParams: true,
  graphQL: { document: true, variables: true },
  genAI: { inputs: true, outputs: true },
  databaseQueryData: true,
  queues: true,
  stackFrameVariables: true,
  frameContextLines: 5
};
function isCollectBehavior(value) {
  return typeof value === "boolean" || "allow" in value || "deny" in value;
}
function resolveHttpHeaders(httpHeaders) {
  if (httpHeaders === void 0) {
    return { ...DEFAULTS.httpHeaders };
  }
  if (isCollectBehavior(httpHeaders)) {
    return { request: httpHeaders, response: httpHeaders };
  }
  return {
    request: httpHeaders.request ?? DEFAULTS.httpHeaders.request,
    response: httpHeaders.response ?? DEFAULTS.httpHeaders.response
  };
}
function resolveDataCollectionOptions(options) {
  const dc = options.dataCollection ?? {};
  return {
    userInfo: dc.userInfo ?? DEFAULTS.userInfo,
    cookies: dc.cookies ?? DEFAULTS.cookies,
    httpHeaders: resolveHttpHeaders(dc.httpHeaders),
    httpBodies: dc.httpBodies ?? DEFAULTS.httpBodies,
    urlQueryParams: dc.urlQueryParams ?? DEFAULTS.urlQueryParams,
    graphQL: {
      document: dc.graphQL?.document ?? DEFAULTS.graphQL.document,
      variables: dc.graphQL?.variables ?? DEFAULTS.graphQL.variables
    },
    genAI: {
      inputs: dc.genAI?.inputs ?? DEFAULTS.genAI.inputs,
      outputs: dc.genAI?.outputs ?? DEFAULTS.genAI.outputs
    },
    databaseQueryData: dc.databaseQueryData ?? DEFAULTS.databaseQueryData,
    queues: dc.queues ?? DEFAULTS.queues,
    stackFrameVariables: dc.stackFrameVariables ?? DEFAULTS.stackFrameVariables,
    frameContextLines: dc.frameContextLines ?? DEFAULTS.frameContextLines
  };
}

exports.resolveDataCollectionOptions = resolveDataCollectionOptions;
//# sourceMappingURL=resolveDataCollectionOptions.js.map
