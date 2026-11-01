Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const componentAnnotationOxcJsx = require('./component-annotation-oxc-jsx.js');
const componentAnnotationOxcAst = require('./component-annotation-oxc-ast.js');
const componentAnnotationOxcFragments = require('./component-annotation-oxc-fragments.js');
const core = require('@sentry/core');

function collectOxcComponentAnnotationInsertions(code, ast, ignoredComponents, sourceFileName, injectIntoHtml) {
  const fragmentContext = componentAnnotationOxcFragments.collectFragmentContext(ast);
  const components = collectComponentJSXRoots(ast);
  const insertionsByOffset = /* @__PURE__ */ new Map();
  for (const component of components) {
    for (const root of component.roots) {
      if (injectIntoHtml) {
        processHtmlJSX(code, root, component.name, ignoredComponents, fragmentContext, insertionsByOffset);
      } else {
        processJSX(code, root, component.name, ignoredComponents, fragmentContext, sourceFileName, insertionsByOffset);
      }
    }
  }
  return componentAnnotationOxcJsx.toAttributeInsertions(insertionsByOffset);
}
function processHtmlJSX(code, node, componentName, ignoredComponents, fragmentContext, insertionsByOffset) {
  if (componentAnnotationOxcJsx.isJSXElement(node) && componentAnnotationOxcJsx.addPendingHtmlAttribute(
    code,
    node.openingElement,
    componentName,
    ignoredComponents,
    fragmentContext,
    insertionsByOffset
  )) {
    return;
  }
  for (const child of node.children ?? []) {
    if (componentAnnotationOxcJsx.isJSXRoot(child)) {
      processHtmlJSX(code, child, componentName, ignoredComponents, fragmentContext, insertionsByOffset);
    }
  }
}
function getJSXRootsFromReturnArgument(argument) {
  if (componentAnnotationOxcJsx.isJSXRoot(argument)) {
    return [argument];
  }
  if (core.isObjectLike(argument) && argument.type === "ConditionalExpression") {
    return [argument.consequent, argument.alternate].filter(componentAnnotationOxcJsx.isJSXRoot);
  }
  return [];
}
function getReturnedJSXFromFunction(functionNode) {
  const body = functionNode.body;
  if (componentAnnotationOxcJsx.isJSXRoot(body)) {
    return [body];
  }
  if (!core.isObjectLike(body) || body.type !== "BlockStatement") {
    return [];
  }
  const bodyStatements = Array.isArray(body.body) ? body.body : [];
  const returnStatement = bodyStatements.find((statement) => {
    return componentAnnotationOxcAst.isAstNode(statement) && statement.type === "ReturnStatement";
  });
  return core.isObjectLike(returnStatement) ? getJSXRootsFromReturnArgument(returnStatement.argument) : [];
}
function pushFunctionComponent(components, nameNode, functionNode) {
  const name = componentAnnotationOxcJsx.getStringName(nameNode);
  if (name) {
    components.push({
      name,
      roots: getReturnedJSXFromFunction(functionNode)
    });
  }
}
function collectComponentJSXRoots(ast) {
  const components = [];
  componentAnnotationOxcAst.walkAst(ast, (node) => {
    if (node.type === "FunctionDeclaration" && core.isObjectLike(node.id)) {
      pushFunctionComponent(components, node.id, node);
      return;
    }
    if (node.type === "VariableDeclarator" && core.isObjectLike(node.id)) {
      if (componentAnnotationOxcAst.isAstNode(node.init) && node.init.type === "ArrowFunctionExpression") {
        pushFunctionComponent(components, node.id, node.init);
      }
      return;
    }
    if (node.type === "ClassDeclaration") {
      pushClassComponent(components, node);
    }
  });
  return components;
}
function pushClassComponent(components, node) {
  const renderMethodBody = getClassRenderMethodBody(node);
  if (!renderMethodBody) {
    return;
  }
  const roots = [];
  componentAnnotationOxcAst.walkAst(renderMethodBody, (child) => {
    if (child.type === "ReturnStatement" && componentAnnotationOxcJsx.isJSXRoot(child.argument)) {
      roots.push(child.argument);
    }
  });
  components.push({
    name: componentAnnotationOxcJsx.getStringName(node.id) ?? "",
    roots
  });
}
function getClassRenderMethodBody(node) {
  if (!core.isObjectLike(node.body) || !Array.isArray(node.body.body)) {
    return null;
  }
  const renderMethod = node.body.body.find((member) => {
    return core.isObjectLike(member) && core.isObjectLike(member.key) && componentAnnotationOxcJsx.getStringName(member.key) === "render" && (core.isObjectLike(member.value) || core.isObjectLike(member.body));
  });
  if (!core.isObjectLike(renderMethod)) {
    return null;
  }
  if (componentAnnotationOxcAst.isAstNode(renderMethod.value)) {
    return renderMethod.value;
  }
  return componentAnnotationOxcAst.isAstNode(renderMethod) ? renderMethod : null;
}
function processJSX(code, node, componentName, ignoredComponents, fragmentContext, sourceFileName, insertionsByOffset) {
  if (componentAnnotationOxcJsx.isJSXElement(node)) {
    componentAnnotationOxcJsx.addPendingAttributes(
      code,
      node.openingElement,
      componentName,
      ignoredComponents,
      fragmentContext,
      sourceFileName,
      insertionsByOffset
    );
  }
  for (const child of node.children ?? []) {
    if (componentAnnotationOxcJsx.isJSXRoot(child)) {
      processJSX(code, child, "", ignoredComponents, fragmentContext, sourceFileName, insertionsByOffset);
    }
  }
}

exports.collectOxcComponentAnnotationInsertions = collectOxcComponentAnnotationInsertions;
//# sourceMappingURL=component-annotation-oxc-walk.js.map
