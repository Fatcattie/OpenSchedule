export declare const mistralConfig: ({
    channelName: string;
    module: {
        readonly name: '@mistralai/mistralai';
        readonly versionRange: '>=2.0.0 <3';
        readonly filePath: 'esm/sdk/chat.js';
    };
    functionQuery: {
        className: string;
        methodName: string;
        kind: 'Auto';
    };
} | {
    channelName: string;
    module: {
        name: '@mistralai/mistralai';
        versionRange: '>=2.0.0 <3';
        filePath: string;
    };
    functionQuery: {
        className: string;
        methodName: string;
        kind: 'Auto';
    };
} | {
    channelName: string;
    module: {
        readonly name: '@mistralai/mistralai';
        readonly versionRange: '>=2.0.0 <3';
        readonly filePath: 'esm/sdk/agents.js';
    };
    functionQuery: {
        className: string;
        methodName: string;
        kind: 'Auto';
    };
})[];
export declare const mistralModuleNames: string[];
export declare const mistralChannels: {
    readonly MISTRAL_CHAT: 'orchestrion:@mistralai/mistralai:chat';
    readonly MISTRAL_CHAT_STREAM: 'orchestrion:@mistralai/mistralai:chat-stream';
    readonly MISTRAL_EMBEDDINGS: 'orchestrion:@mistralai/mistralai:embeddings';
    readonly MISTRAL_AGENTS: 'orchestrion:@mistralai/mistralai:agents';
    readonly MISTRAL_AGENTS_STREAM: 'orchestrion:@mistralai/mistralai:agents-stream';
};
//# sourceMappingURL=mistral.d.ts.map