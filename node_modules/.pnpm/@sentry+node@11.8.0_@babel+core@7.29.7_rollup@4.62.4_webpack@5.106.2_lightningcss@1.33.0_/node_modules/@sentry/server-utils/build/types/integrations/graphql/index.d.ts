import { type GraphQLOptions } from './graphql-dc-subscriber';
/**
 * Instrument the graphql library.
 * This works for graphql v14-v17.
 */
export declare const graphqlIntegration: (options?: GraphQLOptions | undefined) => import("@sentry/core").Integration & {
    name: "Graphql";
};
//# sourceMappingURL=index.d.ts.map