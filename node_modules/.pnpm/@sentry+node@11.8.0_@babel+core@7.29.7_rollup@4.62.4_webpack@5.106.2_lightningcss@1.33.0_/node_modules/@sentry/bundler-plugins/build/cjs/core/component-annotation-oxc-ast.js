Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');

function isAstNode(value) {
  return core.isObjectLike(value) && typeof value.type === "string";
}
function walkAst(node, visit) {
  if (!isAstNode(node)) {
    return;
  }
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        walkAst(child, visit);
      }
    } else if (isAstNode(value)) {
      walkAst(value, visit);
    }
  }
}

exports.isObjectLike = core.isObjectLike;
exports.isAstNode = isAstNode;
exports.walkAst = walkAst;
//# sourceMappingURL=component-annotation-oxc-ast.js.map
