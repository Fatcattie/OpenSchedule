Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const componentAnnotationOxc = require('./component-annotation-oxc.js');

const PARSER_UNAVAILABLE_MESSAGE = "Could not load `oxc-parser` for this platform. React components will not be annotated.";
let warnedParserUnavailable = false;
function createComponentNameAnnotateHooks(ignoredComponents, injectIntoHtml, options = {}) {
  const hooks = componentAnnotationOxc.createOxcComponentNameAnnotateHooks(
    ignoredComponents,
    async () => {
      const parseAstAsync = await options.getParseAstAsync?.() ?? await componentAnnotationOxc.getOxcParseAstAsync();
      if (!parseAstAsync && !warnedParserUnavailable) {
        warnedParserUnavailable = true;
        if (options.logger) {
          options.logger.warn(PARSER_UNAVAILABLE_MESSAGE);
        } else {
          console.warn(`[@sentry/bundler-plugins] ${PARSER_UNAVAILABLE_MESSAGE}`);
        }
      }
      return parseAstAsync;
    },
    injectIntoHtml
  );
  return {
    transform(code, id, meta) {
      return hooks.transform(code, id, meta);
    }
  };
}

exports.createComponentNameAnnotateHooks = createComponentNameAnnotateHooks;
//# sourceMappingURL=component-annotate-hooks.js.map
