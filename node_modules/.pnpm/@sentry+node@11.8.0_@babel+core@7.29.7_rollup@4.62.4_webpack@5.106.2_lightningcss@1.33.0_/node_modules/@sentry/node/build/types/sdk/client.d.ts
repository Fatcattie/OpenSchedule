import type { Tracer } from '@opentelemetry/api';
import { ServerRuntimeClient } from '@sentry/core/server';
import { type AsyncLocalStorageLookup, type SentryTracerProvider } from '@sentry/opentelemetry';
import type { NodeClientOptions } from '../types';
/** A client for using Sentry with Node & OpenTelemetry. */
export declare class NodeClient extends ServerRuntimeClient<NodeClientOptions> {
    traceProvider: SentryTracerProvider | undefined;
    asyncLocalStorageLookup: AsyncLocalStorageLookup | undefined;
    private _tracer;
    private _clientReportInterval;
    private _clientReportOnExitFlushListener;
    private _logOnExitFlushListener;
    private _metricsOnExitFlushListener;
    constructor(options: NodeClientOptions);
    /** @inheritDoc */
    init(): void;
    /** Get the OTEL tracer. */
    get tracer(): Tracer;
    /** @inheritDoc */
    flush(timeout?: number): PromiseLike<boolean>;
    /** @inheritDoc */
    close(timeout?: number | undefined): PromiseLike<boolean>;
    /**
     * Will start tracking client reports for this client.
     *
     * NOTICE: This method will create an interval that is periodically called and attach a `process.on('beforeExit')`
     * hook. To clean up these resources, call `.close()` when you no longer intend to use the client. Not doing so will
     * result in a memory leak.
     */
    startClientReportTracking(): void;
    /** @inheritDoc */
    protected _setupIntegrations(): void;
}
//# sourceMappingURL=client.d.ts.map