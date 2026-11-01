import type { Span } from '@sentry/core';
type AsyncIterableStream = {
    [Symbol.asyncIterator]: () => AsyncIterator<unknown>;
};
/** Whether a value can be drained with `for await`. */
export declare function isAsyncIterable(value: unknown): value is AsyncIterableStream;
/**
 * Instrument a Mistral event stream in place: accumulate response attributes as it is drained and
 * end `span` when it finishes.
 *
 * The stream is patched rather than replaced because `EventStream` extends `ReadableStream`, so
 * handing back a bare async generator would drop `getReader`, `tee`, `pipeTo` and the rest of the
 * `ReadableStream` API the caller is entitled to.
 *
 * Both `for await` and `getReader()` are valid ways to drain a `ReadableStream`, and the SDK's
 * iterator polyfill reads through `getReader()`, so both are wrapped. The first path to see a chunk
 * claims accumulation and the other stays a pass-through, which keeps a chunk from being counted
 * twice when one path drives the other.
 *
 * Returns `false` for a value that is not a stream, leaving it untouched.
 */
export declare function instrumentEventStream(stream: unknown, span: Span, recordOutputs: boolean): boolean;
export {};
//# sourceMappingURL=streaming.d.ts.map