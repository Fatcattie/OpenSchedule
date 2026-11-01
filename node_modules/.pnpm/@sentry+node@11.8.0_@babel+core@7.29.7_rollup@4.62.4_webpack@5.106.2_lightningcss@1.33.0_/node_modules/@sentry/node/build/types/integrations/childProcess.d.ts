interface Options {
    /**
     * Whether to include child process arguments in breadcrumbs data.
     *
     * @default false
     */
    includeChildProcessArgs?: boolean;
}
/**
 * Capture breadcrumbs and events for child processes.
 * For worker thread events, use `workerThreadsIntegration()` instead.
 */
export declare const childProcessIntegration: (options?: Options | undefined) => import("@sentry/core").Integration & {
    name: "ChildProcess";
};
export {};
//# sourceMappingURL=childProcess.d.ts.map