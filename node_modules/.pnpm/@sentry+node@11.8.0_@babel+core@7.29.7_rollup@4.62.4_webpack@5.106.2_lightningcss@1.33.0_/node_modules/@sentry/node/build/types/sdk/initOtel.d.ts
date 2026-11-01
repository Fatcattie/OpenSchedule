import type { NodeClient } from './client';
import { SentryTracerProvider } from '@sentry/opentelemetry';
/**
 * Initialize OpenTelemetry for Node.
 */
export declare function initOpenTelemetry(client: NodeClient): void;
/** Just exported for tests. */
export declare function setupOtel(): SentryTracerProvider | undefined;
//# sourceMappingURL=initOtel.d.ts.map