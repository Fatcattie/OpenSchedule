Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

function isInternalException(hint) {
  return hint.data?.__sentry__ === true;
}
function getPossibleEventMessages(event) {
  const possibleMessages = [];
  if (event.message) {
    possibleMessages.push(event.message);
  }
  try {
    const lastException = event.exception.values[event.exception.values.length - 1];
    if (lastException?.value) {
      possibleMessages.push(lastException.value);
      if (lastException.type) {
        possibleMessages.push(`${lastException.type}: ${lastException.value}`);
      }
    }
  } catch {
  }
  return possibleMessages;
}

exports.getPossibleEventMessages = getPossibleEventMessages;
exports.isInternalException = isInternalException;
//# sourceMappingURL=eventUtils.js.map
