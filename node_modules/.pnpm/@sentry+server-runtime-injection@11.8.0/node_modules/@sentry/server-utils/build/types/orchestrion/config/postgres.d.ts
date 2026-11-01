import type { InstrumentationConfig } from '../apmTypes';
export declare const postgresJsConfig: InstrumentationConfig[];
export declare const postgresJsModuleNames: string[];
export declare const postgresJsChannels: {
    readonly POSTGRESJS_HANDLE: 'orchestrion:postgres:handle';
    readonly POSTGRESJS_CONNECTION: 'orchestrion:postgres:connection';
    readonly POSTGRESJS_EXECUTE: 'orchestrion:postgres:execute';
    readonly POSTGRESJS_CONNECT: 'orchestrion:postgres:connect';
};
//# sourceMappingURL=postgres.d.ts.map