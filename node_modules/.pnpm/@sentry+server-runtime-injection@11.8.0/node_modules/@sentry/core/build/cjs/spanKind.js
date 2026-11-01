Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const SPAN_KIND_NUMBER_TO_NAME = {
  [0]: void 0,
  [1]: "server",
  [2]: "client",
  [3]: "producer",
  [4]: "consumer"
};
function spanKindToName(kind) {
  return SPAN_KIND_NUMBER_TO_NAME[kind];
}

exports.spanKindToName = spanKindToName;
//# sourceMappingURL=spanKind.js.map
