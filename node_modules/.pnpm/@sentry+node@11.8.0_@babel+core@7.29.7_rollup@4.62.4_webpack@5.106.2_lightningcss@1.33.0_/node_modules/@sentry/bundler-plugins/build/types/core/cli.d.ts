import type { NormalizedOptions } from './options-mapping';
import type { SetCommitsOptions } from './types';
/** A single sourcemap directory to upload plus the flags that apply to it. */
interface UploadTarget {
    directory: string;
    dist?: string;
    ext?: string[];
    ignore?: string | string[];
    ignoreFile?: string;
    urlPrefix?: string;
}
/**
 * Thin wrapper around the Sentry CLI's programmatic SDK. The bundler plugin used to drive the
 * old `@sentry/cli` binary through a `SentryCli` class; the new CLI exposes typed methods via
 * `createSentrySDK()` instead. This adapter maps the plugin's structured option shapes onto
 * those methods and keeps all translation logic in one place.
 */
export declare class SentryCliAdapter {
    #private;
    constructor(options: NormalizedOptions);
    /** Create a release and associate it with the configured project(s). */
    createRelease(name: string): Promise<unknown>;
    /** Finalize a release by stamping an end timestamp. */
    finalizeRelease(name: string): Promise<void>;
    /**
     * Associate commits with a release. Translates the plugin's {@link SetCommitsOptions} `auto` /
     * `repo`+`commit` union into the flags accepted by `sentry release set-commits`. The old CLI's
     * `ignoreMissing`/`ignoreEmpty` toggles have no equivalent flag on the new CLI; the caller's
     * `shouldNotThrowOnFailure` handling still swallows the "no repository" failure case.
     */
    setCommits(name: string, setCommitsOptions: SetCommitsOptions): Promise<void>;
    /** Create a deploy for a release. */
    newDeploy(name: string, deploy: NonNullable<NormalizedOptions['release']['deploy']>): Promise<void>;
    /**
     * Upload sourcemaps for one or more directories. The old CLI accepted a structured `include`
     * array; the new `sourcemap upload` command takes a single directory, so we upload each target
     * separately. A client is created per project because project selection is bound at client
     * creation time.
     */
    uploadSourcemaps(name: string, targets: UploadTarget[]): Promise<void>;
    /** Inject debug IDs into the given build artifacts. */
    injectDebugIds(directories: string[], ignore: string | string[] | undefined): Promise<void>;
    /**
     * Resolve the Sentry server URL the CLI is configured to talk to. Used by the telemetry guard
     * to decide whether the current build targets Sentry SaaS. Returns `undefined` on error.
     */
    getServerUrl(): Promise<string | undefined>;
}
export {};
//# sourceMappingURL=cli.d.ts.map