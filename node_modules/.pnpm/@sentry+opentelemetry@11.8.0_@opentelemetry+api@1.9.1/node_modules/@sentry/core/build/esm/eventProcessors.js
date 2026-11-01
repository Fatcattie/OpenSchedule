import { DEBUG_BUILD } from './debug-build.js';
import { debug } from './utils/debug-logger.js';
import { isThenable } from './utils/is.js';
import { safeCallback } from './utils/safeCallback.js';
import { resolvedSyncPromise, rejectedSyncPromise } from './utils/syncpromise.js';

function notifyEventProcessors(processors, event, hint, index = 0, onDrop) {
  try {
    const result = _notifyEventProcessors(event, hint, processors, index, onDrop);
    return isThenable(result) ? result : resolvedSyncPromise(result);
  } catch (error) {
    return rejectedSyncPromise(error);
  }
}
function _notifyEventProcessors(event, hint, processors, index, onDrop) {
  const processor = processors[index];
  if (!event || !processor) {
    return event;
  }
  const processorName = `Event processor "${processor.id || "?"}"`;
  let callbackError = false;
  const result = safeCallback(
    DEBUG_BUILD ? `${processorName} threw an error, dropping event:` : "",
    () => processor({ ...event }, hint),
    () => {
      callbackError = true;
      return null;
    }
  );
  DEBUG_BUILD && result === null && debug.log(`${processorName} dropped event`);
  if (isThenable(result)) {
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

export { notifyEventProcessors };
//# sourceMappingURL=eventProcessors.js.map
