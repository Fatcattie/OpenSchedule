import * as nodeDiagnosticsChannel from 'node:diagnostics_channel';

const keepChannelsReferenced = typeof globalThis.Bun !== "undefined";
const channelsByName = /* @__PURE__ */ new Map();
const tracingChannelsByName = /* @__PURE__ */ new Map();
const channel = keepChannelsReferenced ? (name) => {
  let result = channelsByName.get(name);
  if (!result) {
    result = nodeDiagnosticsChannel.channel(name);
    channelsByName.set(name, result);
  }
  return result;
} : nodeDiagnosticsChannel.channel;
const subscribe = keepChannelsReferenced ? (name, onMessage) => {
  channel(name).subscribe(onMessage);
} : nodeDiagnosticsChannel.subscribe;
const tracingChannel = keepChannelsReferenced && nodeDiagnosticsChannel.tracingChannel ? ((nameOrChannels) => {
  if (typeof nameOrChannels !== "string") {
    return nodeDiagnosticsChannel.tracingChannel(nameOrChannels);
  }
  let result = tracingChannelsByName.get(nameOrChannels);
  if (!result) {
    result = nodeDiagnosticsChannel.tracingChannel(nameOrChannels);
    tracingChannelsByName.set(nameOrChannels, result);
  }
  return result;
}) : nodeDiagnosticsChannel.tracingChannel;

export { channel, subscribe, tracingChannel };
//# sourceMappingURL=diagnosticsChannel.js.map
