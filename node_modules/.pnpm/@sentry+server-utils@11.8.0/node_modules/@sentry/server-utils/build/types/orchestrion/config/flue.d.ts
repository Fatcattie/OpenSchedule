import type { InstrumentationConfig } from '../apmTypes';
/**
 * Flue publishes no diagnostics channels and needs none: it is instrumented by registering with
 * `instrument()`, not by patching call sites. Transforming the entry is only how the module's
 * integration gets registered at evaluation time, which is what installs it on a bundler-only SDK
 * like `@sentry/cloudflare`.
 */
export declare const flueConfig: InstrumentationConfig[];
//# sourceMappingURL=flue.d.ts.map