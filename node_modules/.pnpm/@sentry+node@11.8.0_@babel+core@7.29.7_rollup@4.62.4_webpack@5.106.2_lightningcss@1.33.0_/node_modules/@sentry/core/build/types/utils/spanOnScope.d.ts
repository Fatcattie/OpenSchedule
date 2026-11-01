import type { Scope } from '../scope';
import type { Span } from '../types/span';
/**
 * Set the active span for a given scope.
 * NOTE: This should NOT be used directly, but is only used internally by the trace methods.
 */
export declare function _setSpanForScope(scope: Scope, span: Span | undefined): void;
/**
 * Get the active span for a given scope.
 * NOTE: This should NOT be used directly, but is only used internally by the trace methods.
 */
export declare function _getSpanForScope(scope: Scope): Span | undefined;
//# sourceMappingURL=spanOnScope.d.ts.map