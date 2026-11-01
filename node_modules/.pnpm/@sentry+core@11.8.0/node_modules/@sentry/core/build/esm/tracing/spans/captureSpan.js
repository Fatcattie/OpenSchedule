import { SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME } from '../../semanticAttributes.js';
import { getCombinedScopeData } from '../../utils/scopeData.js';
import { spanToJSON, INTERNAL_getSegmentSpan, streamedSpanJsonToSerializedSpan, spanToStaticSpanJSON } from '../../utils/spanUtils.js';
import { getCapturedScopesOnSpan } from '../utils.js';
import { isStaticBeforeSendSpanCallback, applyBeforeSendSpanCallback } from './beforeSendSpan.js';
import { spanJsonToSerializedStreamedSpan } from './spanJsonToStreamedSpan.js';
import { scopeContextsToSpanAttributes } from './scopeContextAttributes.js';
import { DEFAULT_ENVIRONMENT } from '../../constants.js';
import { SENTRY_SDK_INTEGRATIONS, USER_NAME, USER_IP_ADDRESS, USER_EMAIL, USER_ID, SENTRY_ENVIRONMENT, SENTRY_RELEASE, SENTRY_SDK_VERSION, SENTRY_SDK_NAME, SENTRY_SEGMENT_ID, SENTRY_SEGMENT_NAME, SENTRY_TRACE_LIFECYCLE } from '@sentry/conventions/attributes';

function captureSpan(span, client) {
  const spanJSON = spanToJSON(span);
  if (spanJSON.attributes) {
    delete spanJSON.attributes[SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME];
  }
  const segmentSpan = INTERNAL_getSegmentSpan(span);
  const serializedSegmentSpan = spanToJSON(segmentSpan);
  const { isolationScope: spanIsolationScope, scope: spanScope } = getCapturedScopesOnSpan(span);
  const finalScopeData = getCombinedScopeData(spanIsolationScope, spanScope);
  applyCommonSpanAttributes(spanJSON, serializedSegmentSpan, client, finalScopeData);
  client.emit("preprocessSpan", spanJSON);
  if (spanJSON.is_segment) {
    applyScopeToSegmentSpan(spanJSON, finalScopeData);
    applySdkMetadataToSegmentSpan(spanJSON, client);
    client.emit("processSegmentSpan", spanJSON);
  }
  client.emit("processSpan", spanJSON);
  const { beforeSendSpan, traceLifecycle } = client.getOptions();
  const processedSpan = (
    // check for traceLifecycle here because in static lifecycle,
    // captureSpan is called for INP spans. If an unmigrated beforeSendSpan
    // callback is run on these spans, it will throw an error.
    traceLifecycle !== "static" && beforeSendSpan && !isStaticBeforeSendSpanCallback(beforeSendSpan) ? applyBeforeSendSpanCallback(spanJSON, beforeSendSpan) : spanJSON
  );
  return {
    ...streamedSpanJsonToSerializedSpan(processedSpan),
    _segmentSpan: segmentSpan
  };
}
function applyScopeToSegmentSpan(segmentSpanJSON, scopeData) {
  const contextAttributes = scopeContextsToSpanAttributes(scopeData.contexts);
  safeSetSpanJSONAttributes(segmentSpanJSON, contextAttributes);
}
function safeSetSpanJSONAttributes(spanJSON, newAttributes) {
  const originalAttributes = spanJSON.attributes ?? (spanJSON.attributes = {});
  Object.entries(newAttributes).forEach(([key, value]) => {
    if (value != null && !(key in originalAttributes)) {
      originalAttributes[key] = value;
    }
  });
}
function applySdkMetadataToSegmentSpan(segmentSpanJSON, client) {
  const integrationNames = client.getIntegrationNames();
  if (!integrationNames.length) return;
  safeSetSpanJSONAttributes(segmentSpanJSON, {
    [SENTRY_SDK_INTEGRATIONS]: integrationNames
  });
}
function commonSpanAttributes(serializedSegmentSpan, client, scopeData, includeScopeAttributes = true) {
  const sdk = client.getSdkMetadata();
  const { release, environment } = client.getOptions();
  return {
    [SENTRY_TRACE_LIFECYCLE]: "stream",
    [SENTRY_SEGMENT_NAME]: serializedSegmentSpan.name,
    [SENTRY_SEGMENT_ID]: serializedSegmentSpan.span_id,
    [SENTRY_SDK_NAME]: sdk?.sdk?.name,
    [SENTRY_SDK_VERSION]: sdk?.sdk?.version,
    [SENTRY_RELEASE]: release,
    [SENTRY_ENVIRONMENT]: environment || DEFAULT_ENVIRONMENT,
    [USER_ID]: scopeData.user?.id,
    [USER_EMAIL]: scopeData.user?.email,
    [USER_IP_ADDRESS]: scopeData.user?.ip_address,
    [USER_NAME]: scopeData.user?.username,
    ...includeScopeAttributes ? scopeData.attributes : void 0
  };
}
function applyCommonSpanAttributes(spanJSON, serializedSegmentSpan, client, scopeData) {
  safeSetSpanJSONAttributes(spanJSON, commonSpanAttributes(serializedSegmentSpan, client, scopeData));
}
function captureStandaloneSpanWithStaticCallback(span, client, beforeSendSpan) {
  const spanJSON = spanToStaticSpanJSON(span);
  const segmentSpan = INTERNAL_getSegmentSpan(span);
  const serializedSegmentSpan = spanToJSON(segmentSpan);
  const { isolationScope: spanIsolationScope, scope: spanScope } = getCapturedScopesOnSpan(span);
  const finalScopeData = getCombinedScopeData(spanIsolationScope, spanScope);
  const commonAttributes = commonSpanAttributes(serializedSegmentSpan, client, finalScopeData, false);
  Object.entries(commonAttributes).forEach(([key, value]) => {
    if (value != null && !(key in spanJSON.data)) {
      spanJSON.data[key] = value;
    }
  });
  const processedSpan = applyBeforeSendSpanCallback(spanJSON, beforeSendSpan);
  return spanJsonToSerializedStreamedSpan(processedSpan);
}

export { captureSpan, captureStandaloneSpanWithStaticCallback, safeSetSpanJSONAttributes };
//# sourceMappingURL=captureSpan.js.map
