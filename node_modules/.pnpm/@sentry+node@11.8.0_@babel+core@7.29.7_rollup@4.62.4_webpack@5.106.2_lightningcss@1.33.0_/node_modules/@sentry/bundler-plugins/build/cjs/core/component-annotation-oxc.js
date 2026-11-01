Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const path = require('node:path');
const MagicString = require('magic-string');
const constants = require('../babel-plugin/constants.js');
const utils = require('./utils.js');
const componentAnnotationOxcAst = require('./component-annotation-oxc-ast.js');
const componentAnnotationOxcWalk = require('./component-annotation-oxc-walk.js');

const _interopDefault = e => e && e.__esModule ? e.default : e;

const path__default = /*#__PURE__*/_interopDefault(path);
const MagicString__default = /*#__PURE__*/_interopDefault(MagicString);

let oxcParseAstAsyncPromise;
function getOxcParseAstAsync() {
  if (!oxcParseAstAsyncPromise) {
    oxcParseAstAsyncPromise = import('oxc-parser').then(({ parse }) => {
      return async (code, { lang }) => {
        const { program, errors } = await parse(`component.${lang}`, code, { lang, preserveParens: false });
        if (errors.length > 0) {
          throw new Error(errors[0]?.message);
        }
        return program;
      };
    }).catch(() => null);
  }
  return oxcParseAstAsyncPromise;
}
const JSX_TAG_START_REGEXP = /<[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}.:-]*|<>/u;
const JSX_FILE_REGEXP = /\.[jt]sx$/;
function isAnnotationFile(idWithoutQueryAndHash) {
  if (idWithoutQueryAndHash.match(/\\node_modules\\|\/node_modules\//)) {
    return false;
  }
  return JSX_FILE_REGEXP.test(idWithoutQueryAndHash);
}
function shouldTryParse(code) {
  return JSX_TAG_START_REGEXP.test(code);
}
function shouldSkipIncompatibleFile(idWithoutQueryAndHash) {
  return constants.KNOWN_INCOMPATIBLE_PLUGINS.some((pluginName) => {
    return idWithoutQueryAndHash.includes(`/node_modules/${pluginName}/`) || idWithoutQueryAndHash.includes(`\\node_modules\\${pluginName}\\`);
  });
}
function escapeAttributeValue(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
function makeAttributeText(code, insertionOffset, attributes) {
  const previousCharIsWhitespace = insertionOffset > 0 && /\s/.test(code[insertionOffset - 1] ?? "");
  const prefix = previousCharIsWhitespace ? "" : " ";
  const suffix = previousCharIsWhitespace && code[insertionOffset] === "/" ? " " : "";
  const attributeText = attributes.map(([name, value]) => `${name}="${escapeAttributeValue(value)}"`).join(" ");
  return `${prefix}${attributeText}${suffix}`;
}
function getMagicString(code, meta) {
  if (meta?.magicString) {
    return { magicString: meta.magicString, isNative: true };
  }
  return { magicString: new MagicString__default(code), isNative: false };
}
async function annotateWithOxcParser(code, idWithoutQueryAndHash, ignoredComponents, parseAstAsync, injectIntoHtml, meta) {
  const ast = await parseAstAsync(code, {
    lang: idWithoutQueryAndHash.endsWith(".jsx") ? "jsx" : "tsx"
  });
  if (!componentAnnotationOxcAst.isAstNode(ast)) {
    return null;
  }
  const insertions = componentAnnotationOxcWalk.collectOxcComponentAnnotationInsertions(
    code,
    ast,
    ignoredComponents,
    path__default.basename(idWithoutQueryAndHash),
    injectIntoHtml
  );
  if (insertions.length === 0) {
    return null;
  }
  const { magicString, isNative } = getMagicString(code, meta);
  for (const insertion of insertions) {
    magicString.appendLeft(insertion.offset, makeAttributeText(code, insertion.offset, insertion.attributes));
  }
  if (isNative) {
    return { code: magicString };
  }
  return {
    code: magicString.toString(),
    // No `file`, because magic-string would then make `source` relative to it
    // and drop the directory from `sources`.
    map: magicString.generateMap?.({
      source: idWithoutQueryAndHash,
      includeContent: true,
      hires: true
    })
  };
}
function createOxcComponentNameAnnotateHooks(ignoredComponents, getParseAstAsync, injectIntoHtml = false) {
  return {
    async transform(code, id, meta) {
      const idWithoutQueryAndHash = utils.stripQueryAndHashFromPath(id);
      if (!idWithoutQueryAndHash || !isAnnotationFile(idWithoutQueryAndHash) || !shouldTryParse(code) || shouldSkipIncompatibleFile(idWithoutQueryAndHash)) {
        return null;
      }
      try {
        const parseAstAsync = await getParseAstAsync();
        if (!parseAstAsync) {
          return null;
        }
        return await annotateWithOxcParser(
          code,
          idWithoutQueryAndHash,
          ignoredComponents,
          parseAstAsync,
          injectIntoHtml,
          meta
        );
      } catch {
        return null;
      }
    }
  };
}

exports.createOxcComponentNameAnnotateHooks = createOxcComponentNameAnnotateHooks;
exports.getOxcParseAstAsync = getOxcParseAstAsync;
//# sourceMappingURL=component-annotation-oxc.js.map
