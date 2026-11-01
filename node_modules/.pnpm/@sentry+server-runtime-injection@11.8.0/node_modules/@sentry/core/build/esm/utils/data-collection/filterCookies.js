import { cookiePairsToRecord, parseCookieHeader } from '../cookie.js';
import { SENSITIVE_COOKIE_NAME_SNIPPETS } from './filtering-snippets.js';
import { filterKeyValueData } from './filterKeyValueData.js';

function filterCookies(cookieString, behavior, headerName) {
  if (behavior === false) {
    return {};
  }
  const cookies = cookiePairsToRecord(parseCookieHeader(cookieString, headerName));
  return filterKeyValueData(cookies, behavior, SENSITIVE_COOKIE_NAME_SNIPPETS);
}

export { filterCookies };
//# sourceMappingURL=filterCookies.js.map
