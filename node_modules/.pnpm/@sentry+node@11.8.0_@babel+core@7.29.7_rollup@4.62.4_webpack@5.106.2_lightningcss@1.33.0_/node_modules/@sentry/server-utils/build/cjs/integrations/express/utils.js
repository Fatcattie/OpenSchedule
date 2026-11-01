Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

function getStatusCodeFromResponse(error) {
  const statusCode = error.status || error.statusCode || error.status_code || error.output?.statusCode;
  return statusCode ? parseInt(statusCode, 10) : 500;
}
function defaultShouldHandleError(error) {
  return getStatusCodeFromResponse(error) >= 500;
}

exports.defaultShouldHandleError = defaultShouldHandleError;
//# sourceMappingURL=utils.js.map
