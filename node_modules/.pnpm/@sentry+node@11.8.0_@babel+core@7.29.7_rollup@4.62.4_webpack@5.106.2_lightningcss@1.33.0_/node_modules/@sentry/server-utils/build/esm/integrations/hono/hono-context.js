function hasFetchEvent(c) {
  let hasFetchEvent2 = true;
  try {
    c.event;
  } catch {
    hasFetchEvent2 = false;
  }
  return hasFetchEvent2;
}

export { hasFetchEvent };
//# sourceMappingURL=hono-context.js.map
