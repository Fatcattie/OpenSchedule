import { PipeTransform, Type } from '@nestjs/common';
/**
 * WebSockets pattern parameter decorator.
 * Extracts the subscribed message pattern from the current ws event.
 *
 * @example
 * ```typescript
 * @SubscribeMessage('events')
 * onEvent(@WsPattern() pattern: string) {
 *   return { event: pattern, data: 'ok' };
 * }
 * ```
 *
 * @publicApi
 */
export declare function WsPattern(...pipes: (Type<PipeTransform> | PipeTransform)[]): ParameterDecorator;