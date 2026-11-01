export declare const googleGenAiConfig: ({
    channelName: string;
    module: {
        name: string;
        versionRange: string;
        filePath: string;
    };
    functionQuery: {
        expressionName: "generateContent" | "generateContentStream";
        kind: 'Auto';
    };
} | {
    channelName: string;
    module: {
        name: string;
        versionRange: string;
        filePath: string;
    };
    functionQuery: {
        className: string;
        methodName: string;
        kind: 'Auto';
    };
})[];
export declare const googleGenAiModuleNames: string[];
export declare const googleGenAiChannels: {
    readonly GOOGLE_GENAI_GENERATE_CONTENT: 'orchestrion:@google/genai:generate-content';
    readonly GOOGLE_GENAI_EMBED_CONTENT: 'orchestrion:@google/genai:embed-content';
    readonly GOOGLE_GENAI_CHAT: 'orchestrion:@google/genai:chat';
};
//# sourceMappingURL=google-genai.d.ts.map