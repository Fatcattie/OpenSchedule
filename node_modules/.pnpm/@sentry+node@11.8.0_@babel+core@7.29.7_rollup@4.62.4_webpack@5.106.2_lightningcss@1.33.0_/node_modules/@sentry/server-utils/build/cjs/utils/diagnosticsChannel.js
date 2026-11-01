Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const nodeDiagnosticsChannel = require('node:diagnostics_channel');

function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: 'Module' } });
  if (e) {
    for (const k in e) {
      n[k] = e[k];
    }
  }
  n.default = e;
  return n;
}

const nodeDiagnosticsChannel__namespace = /*#__PURE__*/_interopNamespaceDefault(nodeDiagnosticsChannel);

const keepChannelsReferenced = typeof globalThis.Bun !== "undefined";
const channelsByName = /* @__PURE__ */ new Map();
const tracingChannelsByName = /* @__PURE__ */ new Map();
const channel = keepChannelsReferenced ? (name) => {
  let result = channelsByName.get(name);
  if (!result) {
    result = nodeDiagnosticsChannel__namespace.channel(name);
    channelsByName.set(name, result);
  }
  return result;
} : nodeDiagnosticsChannel__namespace.channel;
const subscribe = keepChannelsReferenced ? (name, onMessage) => {
  channel(name).subscribe(onMessage);
} : nodeDiagnosticsChannel__namespace.subscribe;
const tracingChannel = keepChannelsReferenced && nodeDiagnosticsChannel__namespace.tracingChannel ? ((nameOrChannels) => {
  if (typeof nameOrChannels !== "string") {
    return nodeDiagnosticsChannel__namespace.tracingChannel(nameOrChannels);
  }
  let result = tracingChannelsByName.get(nameOrChannels);
  if (!result) {
    result = nodeDiagnosticsChannel__namespace.tracingChannel(nameOrChannels);
    tracingChannelsByName.set(nameOrChannels, result);
  }
  return result;
}) : nodeDiagnosticsChannel__namespace.tracingChannel;

exports.channel = channel;
exports.subscribe = subscribe;
exports.tracingChannel = tracingChannel;
//# sourceMappingURL=diagnosticsChannel.js.map
