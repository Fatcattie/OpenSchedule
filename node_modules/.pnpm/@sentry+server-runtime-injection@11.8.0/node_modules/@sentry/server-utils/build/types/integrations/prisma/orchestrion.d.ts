interface PrismaV8InstrumentationOptions {
    ignoreSpanTypes: (string | RegExp)[];
}
/**
 * Opens a `prisma:client:operation` span per ORM call, kept active while the terminal runs so the `pg`
 * query spans nest under it like the `db_query` spans did on v5–v7.
 */
export declare function instrumentPrismaV8(options: PrismaV8InstrumentationOptions): void;
export {};
//# sourceMappingURL=orchestrion.d.ts.map