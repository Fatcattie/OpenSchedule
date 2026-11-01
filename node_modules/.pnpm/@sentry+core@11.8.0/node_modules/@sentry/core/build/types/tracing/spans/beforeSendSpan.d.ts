import type { BeforeSendStaticSpanCallback, BeforeSendStreamedSpanCallback } from '../../types/options';
import type { SpanJSON, StreamedSpanJSON } from '../../types/span';
/**
 * A wrapper to use the static, transaction-based span format in your `beforeSendSpan` callback.
 *
 * When using `traceLifecycle: 'static'`, wrap your callback with this function
 * to receive and return a static span instead of a {@link StreamedSpanJSON}.
 *
 * @example
 *
 * Sentry.init({
 *   traceLifecycle: 'static',
 *   beforeSendSpan: withStaticSpan((span) => {
 *     // span is of type SpanJSON
 *     return span;
 *   }),
 * });
 *
 * @param callback - A {@link BeforeSendStaticSpanCallback} that receives and returns a static span.
 * @returns A callback that is compatible with the `beforeSendSpan` option when using `traceLifecycle: 'static'`.
 */
export declare function withStaticSpan(callback: BeforeSendStaticSpanCallback): BeforeSendStreamedSpanCallback;
/**
 * A wrapper to explicitly use the streamed span format in your `beforeSendSpan` callback.
 *
 * @deprecated `beforeSendSpan` callbacks receive {@link StreamedSpanJSON} by default.
 * This function returns the callback unchanged and will be removed in SDK version 12.
 *
 * @param callback - The callback function that receives and returns a {@link StreamedSpanJSON}.
 * @returns The provided callback.
 */
export declare function withStreamedSpan(callback: (span: StreamedSpanJSON) => StreamedSpanJSON): BeforeSendStreamedSpanCallback;
/**
 * Typesafe check to identify if a `beforeSendSpan` callback expects the static span JSON format.
 *
 * @param callback - The `beforeSendSpan` callback to check.
 * @returns `true` if the callback was wrapped with {@link withStaticSpan}.
 */
export declare function isStaticBeforeSendSpanCallback(callback: unknown): callback is BeforeSendStaticSpanCallback;
/**
 * Apply a user-provided beforeSendSpan callback to a span JSON.
 */
export declare function applyBeforeSendSpanCallback<T extends StreamedSpanJSON | SpanJSON>(span: T, beforeSendSpan: (span: T) => T): T;
//# sourceMappingURL=beforeSendSpan.d.ts.map