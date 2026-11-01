const eveRecordingClients = /* @__PURE__ */ new WeakSet();
function markEveGenAiRecordingDefault(client) {
  eveRecordingClients.add(client);
}
function isEveGenAiRecordingDefault(client) {
  return eveRecordingClients.has(client);
}

export { isEveGenAiRecordingDefault, markEveGenAiRecordingDefault };
//# sourceMappingURL=gen-ai-recording-mode.js.map
