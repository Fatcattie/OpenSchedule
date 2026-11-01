import { toAttributeInsertions, isJSXElement, addPendingHtmlAttribute, isJSXRoot, addPendingAttributes, getStringName } from './component-annotation-oxc-jsx.js';
import { walkAst, isAstNode } from './component-annotation-oxc-ast.js';
import { collectFragmentContext } from './component-annotation-oxc-fragments.js';
import { isObjectLike } from '@sentry/core';

function collectOxcComponentAnnotationInsertions(code, ast, ignoredComponents, sourceFileName, injectIntoHtml) {
  const fragmentContext = collectFragmentContext(ast);
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
  return toAttributeInsertions(insertionsByOffset);
}
function processHtmlJSX(code, node, componentName, ignoredComponents, fragmentContext, insertionsByOffset) {
  if (isJSXElement(node) && addPendingHtmlAttribute(
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
    if (isJSXRoot(child)) {
      processHtmlJSX(code, child, componentName, ignoredComponents, fragmentContext, insertionsByOffset);
    }
  }
}
function getJSXRootsFromReturnArgument(argument) {
  if (isJSXRoot(argument)) {
    return [argument];
  }
  if (isObjectLike(argument) && argument.type === "ConditionalExpression") {
    return [argument.consequent, argument.alternate].filter(isJSXRoot);
  }
  return [];
}
function getReturnedJSXFromFunction(functionNode) {
  const body = functionNode.body;
  if (isJSXRoot(body)) {
    return [body];
  }
  if (!isObjectLike(body) || body.type !== "BlockStatement") {
    return [];
  }
  const bodyStatements = Array.isArray(body.body) ? body.body : [];
  const returnStatement = bodyStatements.find((statement) => {
    return isAstNode(statement) && statement.type === "ReturnStatement";
  });
  return isObjectLike(returnStatement) ? getJSXRootsFromReturnArgument(returnStatement.argument) : [];
}
function pushFunctionComponent(components, nameNode, functionNode) {
  const name = getStringName(nameNode);
  if (name) {
    components.push({
      name,
      roots: getReturnedJSXFromFunction(functionNode)
    });
  }
}
function collectComponentJSXRoots(ast) {
  const components = [];
  walkAst(ast, (node) => {
    if (node.type === "FunctionDeclaration" && isObjectLike(node.id)) {
      pushFunctionComponent(components, node.id, node);
      return;
    }
    if (node.type === "VariableDeclarator" && isObjectLike(node.id)) {
      if (isAstNode(node.init) && node.init.type === "ArrowFunctionExpression") {
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
  walkAst(renderMethodBody, (child) => {
    if (child.type === "ReturnStatement" && isJSXRoot(child.argument)) {
      roots.push(child.argument);
    }
  });
  components.push({
    name: getStringName(node.id) ?? "",
    roots
  });
}
function getClassRenderMethodBody(node) {
  if (!isObjectLike(node.body) || !Array.isArray(node.body.body)) {
    return null;
  }
  const renderMethod = node.body.body.find((member) => {
    return isObjectLike(member) && isObjectLike(member.key) && getStringName(member.key) === "render" && (isObjectLike(member.value) || isObjectLike(member.body));
  });
  if (!isObjectLike(renderMethod)) {
    return null;
  }
  if (isAstNode(renderMethod.value)) {
    return renderMethod.value;
  }
  return isAstNode(renderMethod) ? renderMethod : null;
}
function processJSX(code, node, componentName, ignoredComponents, fragmentContext, sourceFileName, insertionsByOffset) {
  if (isJSXElement(node)) {
    addPendingAttributes(
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
    if (isJSXRoot(child)) {
      processJSX(code, child, "", ignoredComponents, fragmentContext, sourceFileName, insertionsByOffset);
    }
  }
}

export { collectOxcComponentAnnotationInsertions };
//# sourceMappingURL=component-annotation-oxc-walk.js.map
