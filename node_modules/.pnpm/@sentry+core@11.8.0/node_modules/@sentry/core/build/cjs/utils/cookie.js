Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const filteringSnippets = require('./data-collection/filtering-snippets.js');

function parseCookieHeader(value, headerName) {
  const segments = (Array.isArray(value) ? value : [value]).flatMap((headerValue) => {
    if (typeof headerValue !== "string") {
      return [];
    }
    return headerName === "set-cookie" ? splitJoinedSetCookieHeader(headerValue).map((cookie) => cookie.split(";")[0]) : headerValue.split(";");
  });
  return segments.map((segment) => segment.trim()).filter((segment) => segment !== "" && segment !== "=").map((segment) => {
    const equalSignIndex = segment.indexOf("=");
    return equalSignIndex === -1 ? (
      // No "=": nameless cookie, the whole segment is the value
      ["", segment]
    ) : (
      // Trim both parts, so that "theme = dark" is named "theme", not "theme "
      [segment.slice(0, equalSignIndex).trim(), segment.slice(equalSignIndex + 1).trim()]
    );
  });
}
function splitJoinedSetCookieHeader(headerValue) {
  return headerValue.split(/,(?=[^;=,]*=)/);
}
function cookiePairsToRecord(pairs) {
  const record = {};
  for (const [name, value] of pairs) {
    if (record[name] === void 0) {
      record[name] = name === "" ? filteringSnippets.FILTERED_VALUE : decodeCookieValue(value);
    }
  }
  return record;
}
function decodeCookieValue(value) {
  const unquoted = value.length > 1 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  try {
    return unquoted.indexOf("%") !== -1 ? decodeURIComponent(unquoted) : unquoted;
  } catch {
    return unquoted;
  }
}

exports.cookiePairsToRecord = cookiePairsToRecord;
exports.parseCookieHeader = parseCookieHeader;
//# sourceMappingURL=cookie.js.map
