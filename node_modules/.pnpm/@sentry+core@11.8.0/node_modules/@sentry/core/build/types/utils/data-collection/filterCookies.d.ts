import type { CollectBehavior } from '../../types/datacollection';
/**
 * Filters a `Cookie` / `Set-Cookie` header string according to a `CollectBehavior`.
 *
 * Each named cookie is filtered independently. A nameless cookie (`"opaque-blob"`, `"=opaque-blob"`)
 * is reported as `{ '': '[Filtered]' }`, since its token is the value.
 *
 * @param headerName - `'set-cookie'` keeps only the cookie pair and ignores the attributes (`Path`, `Max-Age`, ...)
 */
export declare function filterCookies(cookieString: string, behavior: CollectBehavior, headerName: 'cookie' | 'set-cookie'): Record<string, string>;
//# sourceMappingURL=filterCookies.d.ts.map