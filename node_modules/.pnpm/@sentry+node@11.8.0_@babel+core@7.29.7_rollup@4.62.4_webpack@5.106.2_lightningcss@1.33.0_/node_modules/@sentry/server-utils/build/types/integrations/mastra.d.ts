import type { MastraExporterOptions } from '../ai/mastra';
export interface MastraOptions extends MastraExporterOptions {
    /**
     * Construct a Mastra observability pipeline when the app has not configured one. Defaults to
     * `true`. Uses an `@mastra/observability` the app already has; the SDK never installs it.
     */
    bootstrapObservability?: boolean;
}
/**
 * Hooks the `Mastra` constructor and registers a Sentry exporter via `registerExporter()`.
 * Enabled by default. Disable with
 * `defaultIntegrations: integrations => integrations.filter(i => i.name !== 'Mastra')`.
 * Requires the runtime hook or bundler plugin, and `@mastra/core >= 1.63.2`.
 */
export declare const mastraIntegration: (options?: MastraOptions | undefined) => import("@sentry/core").Integration & {
    name: "Mastra";
};
//# sourceMappingURL=mastra.d.ts.map