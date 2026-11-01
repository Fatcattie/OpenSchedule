export declare const hapiConfig: {
    channelName: string;
    module: {
        name: string;
        versionRange: string;
        filePath: string;
    };
    functionQuery: {
        methodName: string;
        kind: "Sync";
    };
}[];
export declare const hapiModuleNames: string[];
export declare const hapiChannels: {
    readonly HAPI_ROUTE: 'orchestrion:@hapi/hapi:route';
    readonly HAPI_EXT: 'orchestrion:@hapi/hapi:ext';
    readonly HAPI_START: 'orchestrion:@hapi/hapi:start';
    readonly HAPI_INITIALIZE: 'orchestrion:@hapi/hapi:initialize';
};
//# sourceMappingURL=hapi.d.ts.map