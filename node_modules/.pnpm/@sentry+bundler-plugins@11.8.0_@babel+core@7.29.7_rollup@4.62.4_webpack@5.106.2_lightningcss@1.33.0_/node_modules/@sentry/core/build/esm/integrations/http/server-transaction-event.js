import { HTTP_RESPONSE_STATUS_CODE } from '@sentry/conventions/attributes';
import { DEBUG_BUILD } from '../../debug-build.js';
import { debug } from '../../utils/debug-logger.js';

const DEFAULT_IGNORE_STATUS_CODES = [
  [401, 404],
  [301, 303],
  [305, 399]
];
function shouldFilterStatusCode(statusCode, dropForStatusCodes) {
  return dropForStatusCodes.some((code) => {
    if (typeof code === "number") {
      return code === statusCode;
    }
    const [min, max] = code;
    return statusCode >= min && statusCode <= max;
  });
}
function processHttpServerTransactionEvent(event, ignoreStatusCodes, spanOrigin) {
  if (event.type !== "transaction") {
    return event;
  }
  if (spanOrigin !== void 0 && event.contexts?.trace?.origin !== spanOrigin) {
    return event;
  }
  const statusCode = event.contexts?.trace?.data?.[HTTP_RESPONSE_STATUS_CODE];
  if (typeof statusCode !== "number") {
    return event;
  }
  if (shouldFilterStatusCode(statusCode, ignoreStatusCodes)) {
    DEBUG_BUILD && debug.log("Dropping transaction due to status code", statusCode);
    return null;
  }
  event.contexts = {
    ...event.contexts,
    response: {
      ...event.contexts?.response,
      status_code: statusCode
    }
  };
  return event;
}

export { DEFAULT_IGNORE_STATUS_CODES, processHttpServerTransactionEvent, shouldFilterStatusCode };
//# sourceMappingURL=server-transaction-event.js.map
