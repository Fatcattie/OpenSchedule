export declare const MISTRAL_INTEGRATION_NAME: 'Mistral';
export declare const MISTRAL_PROVIDER_NAME: 'mistralai';
export declare const MISTRAL_ORIGIN: 'auto.ai.mistralai';
export declare const MISTRAL_METHOD_REGISTRY: {
    readonly 'chat.complete': {
        readonly operation: 'chat';
    };
    readonly 'chat.stream': {
        readonly operation: 'chat';
        readonly streaming: true;
    };
    readonly 'chat.parse': {
        readonly operation: 'chat';
    };
    readonly 'chat.parseStream': {
        readonly operation: 'chat';
        readonly streaming: true;
    };
    readonly 'embeddings.create': {
        readonly operation: 'embeddings';
    };
    readonly 'agents.complete': {
        readonly operation: 'invoke_agent';
    };
    readonly 'agents.stream': {
        readonly operation: 'invoke_agent';
        readonly streaming: true;
    };
};
//# sourceMappingURL=constants.d.ts.map