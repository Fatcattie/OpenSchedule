import type { Span } from '@sentry/core';
import type { GraphqlDocumentNode } from './types';
/**
 * Record the operation name(s) on the enclosing root span and, unless span streaming is enabled,
 * rename it to include them, e.g. `GET /graphql (query GetUser)`.
 */
export declare function renameRootSpanWithOperation(span: Span, operationType: string, operationName?: string): void;
/**
 * Span name follows the GraphQL semantic conventions: `<operation.type> <operation.name>` when both
 * are available, `<operation.type>` when only the type is, otherwise a static fallback.
 */
export declare function getOperationSpanName(operationType: string | undefined, operationName: string | undefined, fallbackName: string): string;
/** Whether a graphql execution result carries GraphQL errors (returned on `result.errors`). */
export declare function hasResultErrors(result: unknown): boolean;
/**
 * Returns the redacted document if `dataCollection.graphQL.document` is enabled, `undefined` otherwise.
 */
export declare function collectGraphqlDocument(document: GraphqlDocumentNode | undefined): string | undefined;
//# sourceMappingURL=utils.d.ts.map