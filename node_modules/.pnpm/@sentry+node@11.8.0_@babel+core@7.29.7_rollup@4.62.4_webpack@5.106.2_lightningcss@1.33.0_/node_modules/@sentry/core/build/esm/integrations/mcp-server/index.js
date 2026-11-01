import { fill } from '../../utils/object.js';
import { wrapAllMCPHandlers, wrapExistingHandlers } from './handlers.js';
import { wrapTransportOnMessage, wrapTransportSend, wrapTransportOnClose, wrapTransportError } from './transport.js';
import { validateMcpServerInstance } from './validation.js';

const wrappedMcpServerOptions = /* @__PURE__ */ new WeakMap();
function applyMissingMcpOptions(target, source) {
  if (!source) {
    return;
  }
  if (target.recordInputs === void 0 && source.recordInputs !== void 0) {
    target.recordInputs = source.recordInputs;
  }
  if (target.recordOutputs === void 0 && source.recordOutputs !== void 0) {
    target.recordOutputs = source.recordOutputs;
  }
}
function instrumentTransport(transport, options) {
  wrapTransportOnMessage(transport, options);
  wrapTransportSend(transport, options);
  wrapTransportOnClose(transport);
  wrapTransportError(transport);
}
function interceptTransportStart(transport, beforeStart) {
  let transportStart;
  let originalDescriptor;
  try {
    transportStart = transport.start;
    originalDescriptor = Object.getOwnPropertyDescriptor(transport, "start");
  } catch {
    return () => void 0;
  }
  if (typeof transportStart !== "function") {
    return () => void 0;
  }
  const originalStart = transportStart;
  let isInstalled = false;
  const restoreStart = () => {
    if (!isInstalled) {
      return;
    }
    try {
      const currentDescriptor = Object.getOwnPropertyDescriptor(transport, "start");
      if (currentDescriptor?.value !== interceptedStart) {
        isInstalled = false;
        return;
      }
      if (originalDescriptor) {
        Object.defineProperty(transport, "start", originalDescriptor);
        isInstalled = false;
      } else if (Reflect.deleteProperty(transport, "start")) {
        isInstalled = false;
      }
    } catch {
    }
  };
  function interceptedStart() {
    restoreStart();
    beforeStart();
    return originalStart.call(this);
  }
  const replacementDescriptor = originalDescriptor && "value" in originalDescriptor ? { ...originalDescriptor, value: interceptedStart } : {
    configurable: originalDescriptor?.configurable ?? true,
    enumerable: originalDescriptor?.enumerable ?? false,
    writable: true,
    value: interceptedStart
  };
  try {
    Object.defineProperty(transport, "start", replacementDescriptor);
    isInstalled = true;
  } catch {
  }
  return restoreStart;
}
function wrapMcpServerWithSentry(mcpServerInstance, options) {
  const existingOptions = wrappedMcpServerOptions.get(mcpServerInstance);
  if (existingOptions) {
    applyMissingMcpOptions(existingOptions, options);
    return mcpServerInstance;
  }
  if (!validateMcpServerInstance(mcpServerInstance)) {
    return mcpServerInstance;
  }
  const serverInstance = mcpServerInstance;
  const captureOptions = { ...options };
  wrappedMcpServerOptions.set(mcpServerInstance, captureOptions);
  fill(serverInstance, "connect", (originalConnect) => {
    return async function(transport, ...restArgs) {
      let isTransportInstrumented = false;
      const instrumentTransportOnce = () => {
        if (isTransportInstrumented) {
          return;
        }
        isTransportInstrumented = true;
        instrumentTransport(transport, captureOptions);
      };
      const restoreStart = interceptTransportStart(transport, instrumentTransportOnce);
      try {
        const result = await originalConnect.call(
          this,
          transport,
          ...restArgs
        );
        instrumentTransportOnce();
        return result;
      } finally {
        restoreStart();
      }
    };
  });
  wrapAllMCPHandlers(serverInstance);
  wrapExistingHandlers(serverInstance);
  return mcpServerInstance;
}

export { wrapMcpServerWithSentry };
//# sourceMappingURL=index.js.map
