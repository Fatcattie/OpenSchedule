/**
 * The value decoding in `cookiePairsToRecord` was originally copied from the 'cookie` module at v0.5.0.
 * https://github.com/jshttp/cookie/blob/a0c84147aab6266bdb3996cf4062e93907c0b0fc/index.js
 * It had the following license:
 *
 * (The MIT License)
 *
 * Copyright (c) 2012-2014 Roman Shtylman <shtylman@gmail.com>
 * Copyright (c) 2015 Douglas Christopher Wilson <doug@somethingdoug.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * 'Software'), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
/** A cookie's name and raw value. A nameless cookie (RFC 6265bis) has the name `''`. */
export type CookiePair = [name: string, value: string];
/**
 * Splits a `Cookie` / `Set-Cookie` header into its ordered name-value pairs. Values are trimmed, but not
 * decoded or unquoted.
 *
 * A segment without an `=` is a nameless cookie, so the bare token is its value (RFC 6265bis).
 */
export declare function parseCookieHeader(value: string | string[], headerName: 'cookie' | 'set-cookie'): CookiePair[];
/**
 * Converts cookie pairs to a record with decoded values. The first cookie of a name wins.
 *
 * A nameless cookie's token is its value, and no name-based denylist can match it. So it is stored
 * under the name `''` and its value is always filtered.
 */
export declare function cookiePairsToRecord(pairs: CookiePair[]): Record<string, string>;
//# sourceMappingURL=cookie.d.ts.map