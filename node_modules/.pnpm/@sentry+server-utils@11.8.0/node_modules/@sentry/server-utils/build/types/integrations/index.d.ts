import type { Integration } from '@sentry/core';
/** These are integrations that are tracing-only integrations. */
export declare function getTracingIntegrations(): Integration[];
/** These are integrations that cover error capture, in addition to tracing. */
export declare function getErrorIntegrations(): Integration[];
//# sourceMappingURL=index.d.ts.map