import type { WebFetchHeaders } from './webfetchapi';
export type ConsoleLevel = 'debug' | 'info' | 'warn' | 'error' | 'log' | 'assert' | 'trace';
interface SentryFetchData {
    method: string;
    url: string;
    request_body_size?: number;
    response_body_size?: number;
    __span?: string;
}
export interface HandlerDataFetch {
    args: any[];
    fetchData: SentryFetchData;
    startTimestamp: number;
    endTimestamp?: number;
    response?: {
        readonly ok: boolean;
        readonly status: number;
        readonly url: string;
        headers: WebFetchHeaders;
    };
    error?: unknown;
    virtualError?: unknown;
    /** Headers that the user passed to the fetch request. */
    headers?: WebFetchHeaders;
}
export interface HandlerDataConsole {
    level: ConsoleLevel;
    args: any[];
}
export interface HandlerDataError {
    column?: number;
    error?: Error;
    line?: number;
    msg: string | object;
    url?: string;
}
export type HandlerDataUnhandledRejection = unknown;
export {};
//# sourceMappingURL=instrument.d.ts.map