import { isObjectLike } from '@sentry/core';
export { isObjectLike } from '@sentry/core';

function isAstNode(value) {
  return isObjectLike(value) && typeof value.type === "string";
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

export { isAstNode, walkAst };
//# sourceMappingURL=component-annotation-oxc-ast.js.map
