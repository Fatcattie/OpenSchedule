import { AsyncLocalStorage } from 'node:async_hooks';
import { getAsyncContextStrategy, getMainCarrier, setAsyncContextStrategy, isContinuingTrace, _INTERNAL_safeMathRandom, generateTraceId, getDefaultIsolationScope, getDefaultCurrentScope } from '@sentry/core';

function setAsyncLocalStorageAsyncContextStrategy() {
  const existingAsyncStorage = getAsyncContextStrategy(getMainCarrier()).getTracingChannelBinding?.()?.asyncLocalStorage;
  const asyncStorage = existingAsyncStorage ?? new AsyncLocalStorage();
  function getScopes() {
    const scopes = asyncStorage.getStore();
    if (scopes) {
      return scopes;
    }
    return {
      scope: getDefaultCurrentScope(),
      isolationScope: getDefaultIsolationScope()
    };
  }
  function withScope(callback) {
    const scope = getScopes().scope.clone();
    const isolationScope = getScopes().isolationScope;
    return asyncStorage.run({ scope, isolationScope }, () => {
      return callback(scope);
    });
  }
  function withSetScope(scope, callback) {
    const isolationScope = getScopes().isolationScope;
    return asyncStorage.run({ scope, isolationScope }, () => {
      return callback(scope);
    });
  }
  function withIsolationScope(callback) {
    const scope = getScopes().scope.clone();
    const isolationScope = getScopes().isolationScope.clone();
    if (!isContinuingTrace(scope.getPropagationContext())) {
      scope.setPropagationContext({
        traceId: generateTraceId(),
        sampleRand: _INTERNAL_safeMathRandom()
      });
    }
    return asyncStorage.run({ scope, isolationScope }, () => {
      return callback(isolationScope);
    });
  }
  function withSetIsolationScope(isolationScope, callback) {
    const scope = getScopes().scope.clone();
    return asyncStorage.run({ scope, isolationScope }, () => {
      return callback(isolationScope);
    });
  }
  setAsyncContextStrategy({
    withScope,
    withSetScope,
    withIsolationScope,
    withSetIsolationScope,
    getCurrentScope: () => getScopes().scope,
    getIsolationScope: () => getScopes().isolationScope,
    getTracingChannelBinding: () => {
      return {
        asyncLocalStorage: asyncStorage
      };
    }
  });
  return asyncStorage;
}

export { setAsyncLocalStorageAsyncContextStrategy };
//# sourceMappingURL=async-context.js.map
