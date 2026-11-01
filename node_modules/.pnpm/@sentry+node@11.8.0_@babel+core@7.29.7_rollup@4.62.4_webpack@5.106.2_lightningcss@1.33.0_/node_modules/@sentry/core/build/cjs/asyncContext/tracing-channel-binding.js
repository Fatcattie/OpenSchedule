Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const carrier = require('../carrier.js');
const timer = require('../utils/timer.js');
const index = require('./index.js');

function waitForTracingChannelBinding(callback, retries = 1) {
  const binding = index.getAsyncContextStrategy(carrier.getMainCarrier()).getTracingChannelBinding?.();
  if (binding) {
    callback();
    return;
  }
  if (!retries) {
    return;
  }
  timer.safeUnref(
    setTimeout(() => {
      waitForTracingChannelBinding(callback, retries - 1);
    }, 1)
  );
}

exports.waitForTracingChannelBinding = waitForTracingChannelBinding;
//# sourceMappingURL=tracing-channel-binding.js.map
