import type { Span } from '@sentry/core';
export declare function registerMastraSpan(mastraId: string, span: Span): void;
export declare function unregisterMastraSpan(mastraId: string): void;
export declare function getSentrySpanForMastraId(mastraId: string): Span | undefined;
//# sourceMappingURL=span-registry.d.ts.map