Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const componentAnnotationOxcAst = require('./component-annotation-oxc-ast.js');
const componentAnnotationOxcJsx = require('./component-annotation-oxc-jsx.js');
const core = require('@sentry/core');

function collectFragmentContext(ast) {
  const context = {
    fragmentAliases: /* @__PURE__ */ new Set(),
    reactNamespaceAliases: /* @__PURE__ */ new Set(["React"])
  };
  componentAnnotationOxcAst.walkAst(ast, (node) => {
    collectFragmentAliasesFromImport(node, context);
    collectFragmentAliasesFromVariableDeclarator(node, context);
  });
  return context;
}
function collectFragmentAliasesFromImport(node, context) {
  if (node.type !== "ImportDeclaration" || !core.isObjectLike(node.source)) {
    return;
  }
  const source = node.source.value;
  if (source !== "react" && source !== "React") {
    return;
  }
  const specifiers = Array.isArray(node.specifiers) ? node.specifiers : [];
  for (const specifier of specifiers) {
    if (!componentAnnotationOxcAst.isAstNode(specifier) || !core.isObjectLike(specifier.local)) {
      continue;
    }
    const localName = componentAnnotationOxcJsx.getStringName(specifier.local);
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
  if (node.type !== "VariableDeclarator" || !core.isObjectLike(node.id) || !core.isObjectLike(node.init)) {
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
  const localName = componentAnnotationOxcJsx.getStringName(id);
  if (!localName) {
    return;
  }
  if (init.type === "Identifier" && context.fragmentAliases.has(componentAnnotationOxcJsx.getStringName(init) ?? "")) {
    context.fragmentAliases.add(localName);
  }
  if (isReactFragmentMemberExpression(init, context)) {
    context.fragmentAliases.add(localName);
  }
}
function collectFragmentAliasFromObjectPattern(id, init, context) {
  if (init.type !== "Identifier" || !context.reactNamespaceAliases.has(componentAnnotationOxcJsx.getStringName(init) ?? "") || !Array.isArray(id.properties)) {
    return;
  }
  for (const property of id.properties) {
    if (!isFragmentObjectPatternProperty(property)) {
      continue;
    }
    const localName = componentAnnotationOxcJsx.getStringName(property.value);
    if (localName) {
      context.fragmentAliases.add(localName);
    }
  }
}
function isImportedReactFragment(specifier) {
  return specifier.type === "ImportSpecifier" && core.isObjectLike(specifier.imported) && componentAnnotationOxcJsx.getStringName(specifier.imported) === "Fragment";
}
function isReactFragmentMemberExpression(init, context) {
  return init.type === "MemberExpression" && core.isObjectLike(init.object) && core.isObjectLike(init.property) && context.reactNamespaceAliases.has(componentAnnotationOxcJsx.getStringName(init.object) ?? "") && componentAnnotationOxcJsx.getStringName(init.property) === "Fragment";
}
function isFragmentObjectPatternProperty(property) {
  return core.isObjectLike(property) && (property.type === "Property" || property.type === "ObjectProperty") && core.isObjectLike(property.key) && componentAnnotationOxcJsx.getStringName(property.key) === "Fragment" && core.isObjectLike(property.value);
}

exports.collectFragmentContext = collectFragmentContext;
//# sourceMappingURL=component-annotation-oxc-fragments.js.map
