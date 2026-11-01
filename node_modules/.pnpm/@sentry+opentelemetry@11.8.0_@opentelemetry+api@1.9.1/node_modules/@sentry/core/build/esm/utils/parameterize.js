function parameterize(strings, ...values) {
  const cooked = strings.map((str, i) => str ?? strings.raw[i]);
  const formatted = new String(String.raw({ raw: cooked }, ...values));
  formatted.__sentry_template_string__ = cooked.join("\0").replace(/%/g, "%%").replace(/\0/g, "%s");
  formatted.__sentry_template_values__ = values;
  return formatted;
}
const fmt = parameterize;

export { fmt, parameterize };
//# sourceMappingURL=parameterize.js.map
