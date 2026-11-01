const COMPOSED_HANDLER = "__COMPOSED_HANDLER";
function isMiddleware(handler) {
  if (typeof handler !== "function") {
    return false;
  }
  const composed = handler[COMPOSED_HANDLER];
  const original = typeof composed === "function" ? composed : handler;
  return original.length >= 2;
}

export { isMiddleware };
//# sourceMappingURL=isMiddleware.js.map
