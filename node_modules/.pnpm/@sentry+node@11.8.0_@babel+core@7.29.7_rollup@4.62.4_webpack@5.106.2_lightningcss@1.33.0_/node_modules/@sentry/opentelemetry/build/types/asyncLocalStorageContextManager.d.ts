import type { Context, ContextManager } from '@opentelemetry/api';
import type { AsyncLocalStorage } from 'node:async_hooks';
export type AsyncLocalStorageLookup = {
    asyncLocalStorage: AsyncLocalStorage<unknown>;
    /**
     * The OpenTelemetry context key under which the `{ scope, isolationScope }` object is stored, for
     * native threads that read scope out of the AsyncLocalStorage (e.g. `@sentry/node-native`). Omitted
     * for the pure AsyncLocalStorage strategy, whose store already is that object.
     */
    contextSymbol?: symbol;
};
/**
 * OpenTelemetry-compatible context manager using Node.js `AsyncLocalStorage`.
 */
export declare class SentryAsyncLocalStorageContextManager implements ContextManager {
    protected readonly _asyncLocalStorage: AsyncLocalStorage<Context>;
    private readonly _kOtListeners;
    private _wrapped;
    constructor(asyncLocalStorage: AsyncLocalStorage<Context>);
    active(): Context;
    with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(context: Context, fn: F, thisArg?: ThisParameterType<F>, ...args: A): ReturnType<F>;
    enable(): this;
    disable(): this;
    bind<T>(context: Context, target: T): T;
    /**
     * Gets underlying AsyncLocalStorage and symbol to allow lookup of scope.
     * This is Sentry-specific.
     */
    getAsyncLocalStorageLookup(): AsyncLocalStorageLookup;
    private _bindFunction;
    private _bindEventEmitter;
    private _patchRemoveListener;
    private _patchRemoveAllListeners;
    private _patchAddListener;
    /**
     * Attach a fresh patch map to the emitter. Returns `undefined` if the emitter does not accept the
     * property (e.g. it is frozen or sealed), in which case the emitter must not be patched at all —
     * without a patch map the remove-listener patches could not resolve their wrapped listeners.
     */
    private _createPatchMap;
    private _getPatchMap;
}
//# sourceMappingURL=asyncLocalStorageContextManager.d.ts.map