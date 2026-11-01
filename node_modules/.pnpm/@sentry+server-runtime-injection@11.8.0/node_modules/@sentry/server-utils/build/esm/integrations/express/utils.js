function getStatusCodeFromResponse(error) {
  const statusCode = error.status || error.statusCode || error.status_code || error.output?.statusCode;
  return statusCode ? parseInt(statusCode, 10) : 500;
}
function defaultShouldHandleError(error) {
  return getStatusCodeFromResponse(error) >= 500;
}

export { defaultShouldHandleError };
//# sourceMappingURL=utils.js.map
