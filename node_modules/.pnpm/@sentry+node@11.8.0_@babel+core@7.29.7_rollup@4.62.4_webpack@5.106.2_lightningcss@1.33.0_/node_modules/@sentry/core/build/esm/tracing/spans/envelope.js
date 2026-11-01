import { dsnToString } from '../../utils/dsn.js';
import { getSdkMetadataForEnvelopeHeader, createEnvelope } from '../../utils/envelope.js';
import { isBrowser } from '../../utils/isBrowser.js';
import { safeDateNow } from '../../utils/randomSafeContext.js';

function createStreamedSpanEnvelope(serializedSpans, dsc, client) {
  const options = client.getOptions();
  const dsn = client.getDsn();
  const tunnel = options.tunnel;
  const sdk = getSdkMetadataForEnvelopeHeader(options._metadata);
  const headers = {
    sent_at: new Date(safeDateNow()).toISOString(),
    ...dscHasRequiredProps(dsc) && { trace: dsc },
    ...sdk && { sdk },
    ...!!tunnel && dsn && { dsn: dsnToString(dsn) }
  };
  return createEnvelope(headers, [createSpanContainerItem(serializedSpans, client)]);
}
function createSpanContainerItem(serializedSpans, client) {
  const inferSetting = client.getDataCollectionOptions().userInfo ? "auto" : "never";
  return [
    { type: "span", item_count: serializedSpans.length, content_type: "application/vnd.sentry.items.span.v2+json" },
    {
      version: 2,
      ingest_settings: isBrowser() ? { infer_ip: inferSetting, infer_user_agent: inferSetting } : void 0,
      items: serializedSpans
    }
  ];
}
function dscHasRequiredProps(dsc) {
  return !!dsc.trace_id && !!dsc.public_key;
}

export { createSpanContainerItem, createStreamedSpanEnvelope };
//# sourceMappingURL=envelope.js.map
