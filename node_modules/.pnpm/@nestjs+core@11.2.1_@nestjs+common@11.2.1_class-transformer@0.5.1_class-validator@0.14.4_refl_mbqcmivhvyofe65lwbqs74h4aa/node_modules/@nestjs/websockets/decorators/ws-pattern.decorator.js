"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsPattern = WsPattern;
const ws_paramtype_enum_1 = require("../enums/ws-paramtype.enum");
const param_utils_1 = require("../utils/param.utils");
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
function WsPattern(...pipes) {
    return (0, param_utils_1.createPipesWsParamDecorator)(ws_paramtype_enum_1.WsParamtype.PATTERN)(undefined, ...pipes);
}