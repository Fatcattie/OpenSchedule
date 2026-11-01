/**
 * Diagnostics-channel-based mysql2 integration.
 *
 * Adds Sentry tracing instrumentation for the
 * [mysql2](https://www.npmjs.com/package/mysql2) library via diagnostics-channel
 * injection. See {@link instrumentMysql2} for how the two mysql2 version ranges
 * are covered.
 *
 * Known limitation vs. older OTel integration it replaced: the callback-less
 * streaming form (`connection.query(sql).on('result', ...)`) is not traced.
 * See the `mysql2` transform config for why. The callback and promise forms
 * (the common case) are fully instrumented.
 */
export declare const mysql2Integration: () => import("@sentry/core").Integration & {
    name: "Mysql2";
};
//# sourceMappingURL=index.d.ts.map