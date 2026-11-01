async function transform(source, map) {
  const callback = this.async();
  const { transform: transformFn } = this.query;
  if (!transformFn) {
    return callback(null, source, map);
  }
  try {
    const id = this.resourcePath;
    const result = await transformFn(source, id);
    if (result == null) {
      callback(null, source, map);
    } else if (typeof result === "string") {
      callback(null, result, map);
    } else {
      callback(null, result.code, result.map || map);
    }
  } catch (error) {
    if (error instanceof Error) {
      callback(error);
    } else {
      callback(new Error(String(error)));
    }
  }
}

export { transform as default };
//# sourceMappingURL=component-annotation-transform.js.map
