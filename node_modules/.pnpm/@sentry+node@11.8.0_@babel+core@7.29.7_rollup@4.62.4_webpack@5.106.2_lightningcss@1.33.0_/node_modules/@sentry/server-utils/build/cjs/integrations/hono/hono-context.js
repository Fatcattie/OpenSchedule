Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

function hasFetchEvent(c) {
  let hasFetchEvent2 = true;
  try {
    c.event;
  } catch {
    hasFetchEvent2 = false;
  }
  return hasFetchEvent2;
}

exports.hasFetchEvent = hasFetchEvent;
//# sourceMappingURL=hono-context.js.map
