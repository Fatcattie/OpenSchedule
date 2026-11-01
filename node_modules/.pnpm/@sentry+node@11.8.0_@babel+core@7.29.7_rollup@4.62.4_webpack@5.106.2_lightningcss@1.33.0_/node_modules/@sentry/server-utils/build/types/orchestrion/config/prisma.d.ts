import type { InstrumentationConfig } from '../apmTypes';
export declare const PRISMA_ASYNC_TERMINALS: readonly ['aggregate', 'first', 'create', 'createAndCount', 'upsert', 'update', 'updateAndCount', 'delete', 'deleteAndCount'];
export declare const PRISMA_LAZY_TERMINALS: readonly ['all', 'createAll', 'updateAll', 'deleteAll'];
export declare const prismaConfig: InstrumentationConfig[];
export declare const prismaModuleNames: string[];
export declare const prismaChannels: {
    readonly PRISMA_AGGREGATE: 'orchestrion:@prisma/orm-family-sql:aggregate';
    readonly PRISMA_FIRST: 'orchestrion:@prisma/orm-family-sql:first';
    readonly PRISMA_CREATE: 'orchestrion:@prisma/orm-family-sql:create';
    readonly PRISMA_CREATE_AND_COUNT: 'orchestrion:@prisma/orm-family-sql:createAndCount';
    readonly PRISMA_UPSERT: 'orchestrion:@prisma/orm-family-sql:upsert';
    readonly PRISMA_UPDATE: 'orchestrion:@prisma/orm-family-sql:update';
    readonly PRISMA_UPDATE_AND_COUNT: 'orchestrion:@prisma/orm-family-sql:updateAndCount';
    readonly PRISMA_DELETE: 'orchestrion:@prisma/orm-family-sql:delete';
    readonly PRISMA_DELETE_AND_COUNT: 'orchestrion:@prisma/orm-family-sql:deleteAndCount';
    readonly PRISMA_ALL: 'orchestrion:@prisma/orm-family-sql:all';
    readonly PRISMA_CREATE_ALL: 'orchestrion:@prisma/orm-family-sql:createAll';
    readonly PRISMA_UPDATE_ALL: 'orchestrion:@prisma/orm-family-sql:updateAll';
    readonly PRISMA_DELETE_ALL: 'orchestrion:@prisma/orm-family-sql:deleteAll';
};
//# sourceMappingURL=prisma.d.ts.map