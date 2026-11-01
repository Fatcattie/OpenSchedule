import { AsyncLocalStorage } from 'node:async_hooks';
import type { Scope } from '@sentry/core';
type ScopeStore = {
    scope: Scope;
    isolationScope: Scope;
};
/**
 * Sets the async context strategy to use AsyncLocalStorage.
 *
 * Returns the underlying `AsyncLocalStorage` whose store is the `{ scope, isolationScope }` object, so
 * callers (e.g. `@sentry/node-native`) can read scope out of it from a native thread.
 */
export declare function setAsyncLocalStorageAsyncContextStrategy(): AsyncLocalStorage<ScopeStore>;
export {};
//# sourceMappingURL=async-context.d.ts.map