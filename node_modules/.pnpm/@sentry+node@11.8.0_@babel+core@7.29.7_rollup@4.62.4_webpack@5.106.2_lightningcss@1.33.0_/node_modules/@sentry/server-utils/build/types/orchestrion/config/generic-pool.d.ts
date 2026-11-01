export declare const genericPoolConfig: ({
    channelName: string;
    module: {
        name: string;
        versionRange: string;
        filePath: string;
    };
    functionQuery: {
        className: string;
        methodName: string;
        kind: "Auto";
        expressionName?: undefined;
    };
} | {
    channelName: string;
    module: {
        name: string;
        versionRange: string;
        filePath: string;
    };
    functionQuery: {
        className?: undefined;
        methodName?: undefined;
        expressionName: string;
        kind: "Callback";
    };
})[];
export declare const genericPoolModuleNames: string[];
export declare const genericPoolChannels: {
    readonly GENERIC_POOL_ACQUIRE: 'orchestrion:generic-pool:acquire';
};
//# sourceMappingURL=generic-pool.d.ts.map