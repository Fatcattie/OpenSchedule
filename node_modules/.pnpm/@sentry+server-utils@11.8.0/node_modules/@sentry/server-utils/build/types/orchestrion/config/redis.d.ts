import type { InstrumentationConfig } from '../apmTypes';
export declare const redisConfig: InstrumentationConfig[];
export declare const redisModuleNames: string[];
export declare const redisChannels: {
    readonly REDIS_COMMAND: 'orchestrion:redis:command';
    readonly NODE_REDIS_COMMAND: 'orchestrion:@redis/client:command';
    readonly NODE_REDIS_EXECUTOR: 'orchestrion:@redis/client:executor';
    readonly NODE_REDIS_CONNECT: 'orchestrion:@redis/client:connect';
    readonly NODE_REDIS_MULTI: 'orchestrion:@redis/client:multi';
    readonly NODE_REDIS_PIPELINE: 'orchestrion:@redis/client:pipeline';
    readonly NODE_REDIS_BATCH: 'orchestrion:@redis/client:batch';
};
//# sourceMappingURL=redis.d.ts.map