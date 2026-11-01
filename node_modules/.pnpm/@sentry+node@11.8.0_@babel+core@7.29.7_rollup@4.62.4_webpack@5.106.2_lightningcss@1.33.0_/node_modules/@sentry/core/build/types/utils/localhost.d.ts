import type { RequestEventData } from '../types/request';
/**
 * Whether a request looks like it was served from the developer's own machine.
 *
 * Ported from Relay's localhost inbound filter so that spans and events are judged by the same rule.
 */
export declare function isLocalhostRequest(request: RequestEventData | undefined, ipAddress?: string | null): boolean;
//# sourceMappingURL=localhost.d.ts.map