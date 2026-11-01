type RequestDataIncludeOptions = {
    cookies?: boolean;
    data?: boolean;
    headers?: boolean;
    ip?: boolean;
    query_string?: boolean;
    url?: boolean;
};
type RequestDataIntegrationOptions = {
    /**
     * Defines what request data should be collected.
     *
     * @deprecated Use `dataCollection` from the `init()` options instead. Check the docs for more info: https://docs.sentry.io/platforms/javascript/configuration/options/#dataCollection
     */
    include?: RequestDataIncludeOptions;
};
/**
 * Add data about a request to an event. Primarily for use in Node-based SDKs, but included in `@sentry/core`
 * so it can be used in cross-platform SDKs like `@sentry/nextjs`.
 */
export declare const requestDataIntegration: (options?: RequestDataIntegrationOptions | undefined) => import("..").Integration & {
    name: "RequestData";
};
export {};
//# sourceMappingURL=requestdata.d.ts.map