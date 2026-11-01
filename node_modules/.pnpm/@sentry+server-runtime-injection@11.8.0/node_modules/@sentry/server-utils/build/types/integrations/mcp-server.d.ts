/**
 * Auto-instruments `@modelcontextprotocol/server` (v2) and `@modelcontextprotocol/sdk` (v1)
 * `McpServer` instances, so users no longer have to wrap them with `wrapMcpServerWithSentry`
 * by hand. Enabled by default. Requires the runtime hook or a bundler plugin (orchestrion) to
 * inject the constructor channel.
 */
export declare const mcpServerIntegration: () => import("@sentry/core").Integration & {
    name: string;
};
//# sourceMappingURL=mcp-server.d.ts.map