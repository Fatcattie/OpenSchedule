import type { InstrumentationConfig } from '../apmTypes';
/**
 * The distinct instrumented package names (`module.name`) across a library's
 * channel configs. Integrations pass this to `invokeOrchestrionInstrumentation`
 * so they subscribe only once one of their packages is actually injected.
 */
export declare function getModuleNames(configs: readonly InstrumentationConfig[]): string[];
//# sourceMappingURL=module-names.d.ts.map