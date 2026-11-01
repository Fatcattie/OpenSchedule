export declare const dataloaderConfig: ({
    channelName: string;
    module: {
        readonly name: 'dataloader';
        readonly versionRange: '>=2.0.0 <3';
        readonly filePath: 'index.js';
    };
    functionQuery: {
        functionName: string;
        kind: "Sync";
        expressionName?: undefined;
    };
} | {
    channelName: string;
    module: {
        readonly name: 'dataloader';
        readonly versionRange: '>=2.0.0 <3';
        readonly filePath: 'index.js';
    };
    functionQuery: {
        functionName?: undefined;
        expressionName: string;
        kind: "Async";
    };
} | {
    channelName: string;
    module: {
        readonly name: 'dataloader';
        readonly versionRange: '>=2.0.0 <3';
        readonly filePath: 'index.js';
    };
    functionQuery: {
        functionName?: undefined;
        expressionName: string;
        kind: "Sync";
    };
})[];
export declare const dataloaderChannels: {
    readonly DATALOADER_CONSTRUCT: 'orchestrion:dataloader:construct';
    readonly DATALOADER_LOAD: 'orchestrion:dataloader:load';
    readonly DATALOADER_LOAD_MANY: 'orchestrion:dataloader:loadMany';
    readonly DATALOADER_PRIME: 'orchestrion:dataloader:prime';
    readonly DATALOADER_CLEAR: 'orchestrion:dataloader:clear';
    readonly DATALOADER_CLEAR_ALL: 'orchestrion:dataloader:clearAll';
};
//# sourceMappingURL=dataloader.d.ts.map