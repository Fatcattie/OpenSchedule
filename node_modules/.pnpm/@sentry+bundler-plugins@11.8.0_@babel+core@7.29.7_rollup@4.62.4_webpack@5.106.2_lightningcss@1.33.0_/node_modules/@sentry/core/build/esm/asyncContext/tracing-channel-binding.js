import { getMainCarrier } from '../carrier.js';
import { safeUnref } from '../utils/timer.js';
import { getAsyncContextStrategy } from './index.js';

function waitForTracingChannelBinding(callback, retries = 1) {
  const binding = getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.();
  if (binding) {
    callback();
    return;
  }
  if (!retries) {
    return;
  }
  safeUnref(
    setTimeout(() => {
      waitForTracingChannelBinding(callback, retries - 1);
    }, 1)
  );
}

export { waitForTracingChannelBinding };
//# sourceMappingURL=tracing-channel-binding.js.map
