export declare const expressConfig: ({
    channelName: string;
    module: {
        name: string;
        versionRange: string;
        filePath: string;
    };
    functionQuery: {
        expressionName: string;
        kind: "Callback";
    };
} | {
    channelName: string;
    module: {
        name: string;
        versionRange: string;
        filePath: string;
    };
    functionQuery: {
        expressionName: string;
        kind: "Sync";
    };
})[];
export declare const expressModuleNames: string[];
export declare const expressChannels: {
    readonly EXPRESS_HANDLE: 'orchestrion:express:handle';
    readonly ROUTER_HANDLE: 'orchestrion:router:handle';
    readonly EXPRESS_REGISTER: 'orchestrion:express:register';
    readonly ROUTER_REGISTER: 'orchestrion:router:register';
};
//# sourceMappingURL=express.d.ts.map