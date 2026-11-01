Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const cookie = require('../cookie.js');
const filteringSnippets = require('./filtering-snippets.js');
const filterKeyValueData = require('./filterKeyValueData.js');

function filterCookies(cookieString, behavior, headerName) {
  if (behavior === false) {
    return {};
  }
  const cookies = cookie.cookiePairsToRecord(cookie.parseCookieHeader(cookieString, headerName));
  return filterKeyValueData.filterKeyValueData(cookies, behavior, filteringSnippets.SENSITIVE_COOKIE_NAME_SNIPPETS);
}

exports.filterCookies = filterCookies;
//# sourceMappingURL=filterCookies.js.map
