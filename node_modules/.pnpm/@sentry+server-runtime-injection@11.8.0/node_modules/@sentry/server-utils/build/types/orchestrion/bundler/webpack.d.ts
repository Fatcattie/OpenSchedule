import type { Compiler } from 'webpack';
import type { InstrumentationConfig } from '../apmTypes';
import type { PluginOptions } from './options';
import { getOrchestrionLoaderPath, resolveOrchestrionRuntimeRequest } from './resolve';
import type { AnyInstrumentationConfig, SerializableInstrumentationConfig } from '../apmTypes';
export declare const serializeInstrumentations: (configs: AnyInstrumentationConfig[]) => SerializableInstrumentationConfig[];
export type { SerializableInstrumentationConfig } from '../apmTypes';
export { getOrchestrionLoaderPath, resolveOrchestrionRuntimeRequest };
/** The central instrumentation config, to pass as the loader's `instrumentations` option. */
export declare function getSentryInstrumentations(): InstrumentationConfig[];
/**
 * The code-transform webpack plugin, pre-fed the instrumentation config.
 *
 * Instrumented packages marked as `externals` never pass through the code
 * transform, so a compilation warning is emitted for them.
 */
export declare function sentryOrchestrionWebpackPlugin(options?: PluginOptions): {
    apply(compiler: Compiler): void;
};
//# sourceMappingURL=webpack.d.ts.map