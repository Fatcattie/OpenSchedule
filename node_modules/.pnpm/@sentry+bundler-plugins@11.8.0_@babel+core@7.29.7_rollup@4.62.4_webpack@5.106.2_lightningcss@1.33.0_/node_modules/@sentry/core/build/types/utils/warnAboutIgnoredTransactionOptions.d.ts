import type { ClientOptions } from '../types/options';
/**
 * Warns about `beforeSendTransaction` and `ignoreTransactions` being ignored because span streaming is enabled.
 *
 * Both options are tied to the transaction event that span streaming no longer produces, so they silently
 * stop taking effect when users upgrade. Since that's easy to miss, this warning bypasses the `debug` logger
 * (which is opt-in and stripped from non-debug bundles) and writes to the console directly.
 */
export declare function maybeWarnAboutIgnoredTransactionOptions(options: ClientOptions): void;
//# sourceMappingURL=warnAboutIgnoredTransactionOptions.d.ts.map