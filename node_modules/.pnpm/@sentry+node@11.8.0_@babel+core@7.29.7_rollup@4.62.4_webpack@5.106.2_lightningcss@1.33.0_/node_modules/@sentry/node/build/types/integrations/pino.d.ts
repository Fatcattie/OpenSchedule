import type { LogSeverityLevel } from '@sentry/core';
type PinoOptions = {
    /**
     * Automatically instrument all Pino loggers.
     *
     * When set to `false`, only loggers marked with `pinoIntegration.trackLogger(logger)` will be captured.
     *
     * @default true
     */
    autoInstrument: boolean;
    /**
     * Options to enable capturing of error events.
     */
    error: {
        /**
         * Levels that trigger capturing of events.
         *
         * @default []
         */
        levels: LogSeverityLevel[];
        /**
         * By default, Sentry will mark captured errors as handled.
         * Set this to `false` if you want to mark them as unhandled instead.
         *
         * @default true
         */
        handled: boolean;
    };
    /**
     * Options to enable capturing of logs.
     */
    log: {
        /**
         * Levels that trigger capturing of logs.
         *
         * @default ["trace", "debug", "info", "warn", "error", "fatal"]
         */
        levels: LogSeverityLevel[];
    };
};
type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? Partial<T[P]> : T[P];
};
/**
 * Integration for Pino logging library.
 * Captures Pino logs as Sentry logs and optionally captures some log levels as events.
 *
 * By default, all Pino loggers will be captured. To ignore a specific logger, use `pinoIntegration.untrackLogger(logger)`.
 *
 * If you disable automatic instrumentation with `autoInstrument: false`, you can mark specific loggers to be tracked with `pinoIntegration.trackLogger(logger)`.
 *
 * Requires Pino >=v8.0.0
 */
export declare const pinoIntegration: ((userOptions?: DeepPartial<PinoOptions> | undefined) => import("@sentry/core").Integration & {
    name: string;
}) & {
    trackLogger(logger: unknown): void;
    untrackLogger(logger: unknown): void;
};
export {};
//# sourceMappingURL=pino.d.ts.map