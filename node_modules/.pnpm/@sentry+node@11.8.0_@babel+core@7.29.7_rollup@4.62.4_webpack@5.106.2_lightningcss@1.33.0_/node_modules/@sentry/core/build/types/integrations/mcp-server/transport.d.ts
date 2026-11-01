/**
 * Transport layer instrumentation for MCP server
 *
 * Handles message interception and response correlation.
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
 */
import type { McpServerWrapperOptions, MCPTransport } from './types';
/**
 * Wraps transport.onmessage to create spans for incoming messages.
 * Stores client info and protocol version only for legacy initialize requests.
 * Modern request metadata is read directly when building each message's span.
 * @param transport - MCP transport instance to wrap
 * @param options - MCP capture overrides
 */
export declare function wrapTransportOnMessage(transport: MCPTransport, options: McpServerWrapperOptions): void;
/**
 * Wraps transport.send to handle outgoing messages and response correlation.
 * Caches legacy initialize metadata and applies modern result metadata only to
 * the corresponding request span.
 * @param transport - MCP transport instance to wrap
 * @param options - MCP capture overrides
 */
export declare function wrapTransportSend(transport: MCPTransport, options: McpServerWrapperOptions): void;
/**
 * Wraps transport.onclose to clean up pending spans for this transport only
 * @param transport - MCP transport instance to wrap
 */
export declare function wrapTransportOnClose(transport: MCPTransport): void;
/**
 * Wraps transport error handlers to capture connection errors
 * @param transport - MCP transport instance to wrap
 */
export declare function wrapTransportError(transport: MCPTransport): void;
//# sourceMappingURL=transport.d.ts.map