Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const dsn = require('./utils/dsn.js');
const envelope = require('./utils/envelope.js');
const randomSafeContext = require('./utils/randomSafeContext.js');

function _enhanceEventWithSdkInfo(event, newSdkInfo) {
  if (!newSdkInfo) {
    return event;
  }
  const eventSdkInfo = event.sdk || {};
  event.sdk = {
    ...eventSdkInfo,
    name: eventSdkInfo.name || newSdkInfo.name,
    version: eventSdkInfo.version || newSdkInfo.version,
    integrations: [...event.sdk?.integrations || [], ...newSdkInfo.integrations || []],
    packages: [...event.sdk?.packages || [], ...newSdkInfo.packages || []],
    settings: event.sdk?.settings || newSdkInfo.settings ? {
      ...event.sdk?.settings,
      ...newSdkInfo.settings
    } : void 0
  };
  return event;
}
function createSessionEnvelope(session, dsn$1, metadata, tunnel) {
  const sdkInfo = envelope.getSdkMetadataForEnvelopeHeader(metadata);
  const envelopeHeaders = {
    sent_at: new Date(randomSafeContext.safeDateNow()).toISOString(),
    ...sdkInfo && { sdk: sdkInfo },
    ...!!tunnel && dsn$1 && { dsn: dsn.dsnToString(dsn$1) }
  };
  const envelopeItem = "aggregates" in session ? [{ type: "sessions" }, session] : [{ type: "session" }, session.toJSON()];
  return envelope.createEnvelope(envelopeHeaders, [envelopeItem]);
}
function createEventEnvelope(event, dsn, metadata, tunnel) {
  const sdkInfo = envelope.getSdkMetadataForEnvelopeHeader(metadata);
  const eventType = event.type && event.type !== "replay_event" ? event.type : "event";
  _enhanceEventWithSdkInfo(event, metadata?.sdk);
  const envelopeHeaders = envelope.createEventEnvelopeHeaders(event, sdkInfo, tunnel, dsn);
  delete event.sdkProcessingMetadata;
  const eventItem = [{ type: eventType }, event];
  return envelope.createEnvelope(envelopeHeaders, [eventItem]);
}

exports._enhanceEventWithSdkInfo = _enhanceEventWithSdkInfo;
exports.createEventEnvelope = createEventEnvelope;
exports.createSessionEnvelope = createSessionEnvelope;
//# sourceMappingURL=envelope.js.map
