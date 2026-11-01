import { walkAst, isAstNode } from './component-annotation-oxc-ast.js';
import { getStringName } from './component-annotation-oxc-jsx.js';
import { isObjectLike } from '@sentry/core';

function collectFragmentContext(ast) {
  const context = {
    fragmentAliases: /* @__PURE__ */ new Set(),
    reactNamespaceAliases: /* @__PURE__ */ new Set(["React"])
  };
  walkAst(ast, (node) => {
    collectFragmentAliasesFromImport(node, context);
    collectFragmentAliasesFromVariableDeclarator(node, context);
  });
  return context;
}
function collectFragmentAliasesFromImport(node, context) {
  if (node.type !== "ImportDeclaration" || !isObjectLike(node.source)) {
    return;
  }
  const source = node.source.value;
  if (source !== "react" && source !== "React") {
    return;
  }
  const specifiers = Array.isArray(node.specifiers) ? node.specifiers : [];
  for (const specifier of specifiers) {
    if (!isAstNode(specifier) || !isObjectLike(specifier.local)) {
      continue;
    }
    const localName = getStringName(specifier.local);
    if (!localName) {
      continue;
    }
    if (specifier.type === "ImportDefaultSpecifier" || specifier.type === "ImportNamespaceSpecifier") {
      context.reactNamespaceAliases.add(localName);
    } else if (isImportedReactFragment(specifier)) {
      context.fragmentAliases.add(localName);
    }
  }
}
function collectFragmentAliasesFromVariableDeclarator(node, context) {
  if (node.type !== "VariableDeclarator" || !isObjectLike(node.id) || !isObjectLike(node.init)) {
    return;
  }
  if (node.id.type === "Identifier") {
    collectFragmentAliasFromIdentifier(node.id, node.init, context);
    return;
  }
  if (node.id.type === "ObjectPattern") {
    collectFragmentAliasFromObjectPattern(node.id, node.init, context);
  }
}
function collectFragmentAliasFromIdentifier(id, init, context) {
  const localName = getStringName(id);
  if (!localName) {
    return;
  }
  if (init.type === "Identifier" && context.fragmentAliases.has(getStringName(init) ?? "")) {
    context.fragmentAliases.add(localName);
  }
  if (isReactFragmentMemberExpression(init, context)) {
    context.fragmentAliases.add(localName);
  }
}
function collectFragmentAliasFromObjectPattern(id, init, context) {
  if (init.type !== "Identifier" || !context.reactNamespaceAliases.has(getStringName(init) ?? "") || !Array.isArray(id.properties)) {
    return;
  }
  for (const property of id.properties) {
    if (!isFragmentObjectPatternProperty(property)) {
      continue;
    }
    const localName = getStringName(property.value);
    if (localName) {
      context.fragmentAliases.add(localName);
    }
  }
}
function isImportedReactFragment(specifier) {
  return specifier.type === "ImportSpecifier" && isObjectLike(specifier.imported) && getStringName(specifier.imported) === "Fragment";
}
function isReactFragmentMemberExpression(init, context) {
  return init.type === "MemberExpression" && isObjectLike(init.object) && isObjectLike(init.property) && context.reactNamespaceAliases.has(getStringName(init.object) ?? "") && getStringName(init.property) === "Fragment";
}
function isFragmentObjectPatternProperty(property) {
  return isObjectLike(property) && (property.type === "Property" || property.type === "ObjectProperty") && isObjectLike(property.key) && getStringName(property.key) === "Fragment" && isObjectLike(property.value);
}

export { collectFragmentContext };
//# sourceMappingURL=component-annotation-oxc-fragments.js.map
