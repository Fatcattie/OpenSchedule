Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const eveRecordingClients = /* @__PURE__ */ new WeakSet();
function markEveGenAiRecordingDefault(client) {
  eveRecordingClients.add(client);
}
function isEveGenAiRecordingDefault(client) {
  return eveRecordingClients.has(client);
}

exports.isEveGenAiRecordingDefault = isEveGenAiRecordingDefault;
exports.markEveGenAiRecordingDefault = markEveGenAiRecordingDefault;
//# sourceMappingURL=gen-ai-recording-mode.js.map
