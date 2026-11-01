Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const debugBuild = require('./debug-build.js');
const debugLogger = require('./utils/debug-logger.js');
const is = require('./utils/is.js');
const safeCallback = require('./utils/safeCallback.js');
const syncpromise = require('./utils/syncpromise.js');

function notifyEventProcessors(processors, event, hint, index = 0, onDrop) {
  try {
    const result = _notifyEventProcessors(event, hint, processors, index, onDrop);
    return is.isThenable(result) ? result : syncpromise.resolvedSyncPromise(result);
  } catch (error) {
    return syncpromise.rejectedSyncPromise(error);
  }
}
function _notifyEventProcessors(event, hint, processors, index, onDrop) {
  const processor = processors[index];
  if (!event || !processor) {
    return event;
  }
  const processorName = `Event processor "${processor.id || "?"}"`;
  let callbackError = false;
  const result = safeCallback.safeCallback(
    debugBuild.DEBUG_BUILD ? `${processorName} threw an error, dropping event:` : "",
    () => processor({ ...event }, hint),
    () => {
      callbackError = true;
      return null;
    }
  );
  debugBuild.DEBUG_BUILD && result === null && debugLogger.debug.log(`${processorName} dropped event`);
  if (is.isThenable(result)) {
    return result.then((final) => {
      if (!final) {
        onDrop?.(callbackError ? "callback_error" : "event_processor");
        return null;
      }
      return _notifyEventProcessors(final, hint, processors, index + 1, onDrop);
    });
  }
  if (!result) {
    onDrop?.(callbackError ? "callback_error" : "event_processor");
    return null;
  }
  return _notifyEventProcessors(result, hint, processors, index + 1, onDrop);
}

exports.notifyEventProcessors = notifyEventProcessors;
//# sourceMappingURL=eventProcessors.js.map
