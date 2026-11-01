import type { Options } from '../core/index';
export declare const sentryWebpackPlugin: (options?: SentryWebpackPluginOptions) => any;
export type SentryWebpackPluginOptions = Options & {
    _experiments?: Options['_experiments'] & {
        /**
         * If enabled, the webpack plugin will exit the build process after the build completes.
         * Use this with caution, as it will terminate the process.
         *
         * More information: https://github.com/getsentry/sentry-javascript-bundler-plugins/issues/345
         *
         * @default false
         */
        forceExitOnBuildCompletion?: boolean;
    };
};
//# sourceMappingURL=index.d.ts.map