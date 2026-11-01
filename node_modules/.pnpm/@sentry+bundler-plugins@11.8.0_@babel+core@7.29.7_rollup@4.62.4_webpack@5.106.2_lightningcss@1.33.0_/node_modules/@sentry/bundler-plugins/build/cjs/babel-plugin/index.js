Object.defineProperties(exports, { __esModule: { value: true }, [Symbol.toStringTag]: { value: 'Module' } });

const componentAnnotation = require('./component-annotation.js');
const constants = require('./constants.js');
const experimental = require('./experimental.js');

const SENTRY_LABEL_ATTRIBUTE = "sentry-label";
const MAX_LABEL_LENGTH = 64;
const DEFAULT_TEXT_COMPONENT_NAMES = ["Text", "text"];
const MAX_TEXT_SEARCH_DEPTH = 3;
function componentNameAnnotatePlugin({ types: t }) {
  return {
    visitor: {
      Program: {
        enter(path, state) {
          const fragmentContext = collectFragmentContext(path);
          state.sentryFragmentContext = fragmentContext;
        }
      },
      FunctionDeclaration(path, state) {
        if (!path.node.id?.name) {
          return;
        }
        if (isKnownIncompatiblePluginFromState(state)) {
          return;
        }
        const context = createJSXProcessingContext(state, t, path.node.id.name);
        functionBodyPushAttributes(context, path);
      },
      ArrowFunctionExpression(path, state) {
        const parent = path.parent;
        if (!parent || !("id" in parent) || !parent.id || !("name" in parent.id) || !parent.id.name) {
          return;
        }
        if (isKnownIncompatiblePluginFromState(state)) {
          return;
        }
        const context = createJSXProcessingContext(state, t, parent.id.name);
        functionBodyPushAttributes(context, path);
      },
      ClassDeclaration(path, state) {
        const name = path.get("id");
        const properties = path.get("body").get("body");
        const render = properties.find((prop) => {
          return prop.isClassMethod() && prop.get("key").isIdentifier({ name: "render" });
        });
        if (!render?.traverse || isKnownIncompatiblePluginFromState(state)) {
          return;
        }
        const context = createJSXProcessingContext(state, t, name.node?.name || "");
        render.traverse({
          ReturnStatement(returnStatement) {
            const arg = returnStatement.get("argument");
            if (!arg.isJSXElement() && !arg.isJSXFragment()) {
              return;
            }
            processJSX(context, arg);
          }
        });
      }
    }
  };
}
function createJSXProcessingContext(state, t, componentName) {
  return {
    annotateFragments: state.opts["annotate-fragments"] === true,
    t,
    componentName,
    sourceFileName: sourceFileNameFromState(state),
    attributeNames: attributeNamesFromState(state),
    ignoredComponents: state.opts.ignoredComponents ?? [],
    fragmentContext: state.sentryFragmentContext,
    autoInjectSentryLabel: !!state.opts.autoInjectSentryLabel,
    textComponentNames: (state.opts.autoInjectSentryLabel && typeof state.opts.autoInjectSentryLabel === "object" ? state.opts.autoInjectSentryLabel.textComponentNames : void 0) ?? DEFAULT_TEXT_COMPONENT_NAMES
  };
}
function functionBodyPushAttributes(context, path) {
  let jsxNode;
  const functionBody = path.get("body").get("body");
  if (!("length" in functionBody) && functionBody.parent && (functionBody.parent.type === "JSXElement" || functionBody.parent.type === "JSXFragment")) {
    const maybeJsxNode = functionBody.find((c) => {
      return c.type === "JSXElement" || c.type === "JSXFragment";
    });
    if (!maybeJsxNode) {
      return;
    }
    jsxNode = maybeJsxNode;
  } else {
    const returnStatement = functionBody.find((c) => {
      return c.type === "ReturnStatement";
    });
    if (!returnStatement) {
      return;
    }
    const arg = returnStatement.get("argument");
    if (!arg) {
      return;
    }
    if (Array.isArray(arg)) {
      return;
    }
    if (arg.isConditionalExpression()) {
      const consequent = arg.get("consequent");
      if (consequent.isJSXFragment() || consequent.isJSXElement()) {
        processJSX(context, consequent);
      }
      const alternate = arg.get("alternate");
      if (alternate.isJSXFragment() || alternate.isJSXElement()) {
        processJSX(context, alternate);
      }
      return;
    }
    if (!arg.isJSXFragment() && !arg.isJSXElement()) {
      return;
    }
    jsxNode = arg;
  }
  if (!jsxNode) {
    return;
  }
  processJSX(context, jsxNode);
}
function processJSX(context, jsxNode, componentName) {
  if (!jsxNode) {
    return;
  }
  const currentComponentName = componentName ?? context.componentName;
  const isRootElement = componentName === void 0;
  const paths = jsxNode.get("openingElement");
  const openingElements = Array.isArray(paths) ? paths : [paths];
  openingElements.forEach((openingElement) => {
    applyAttributes(context, openingElement, currentComponentName);
  });
  let children = jsxNode.get("children");
  if (children && !("length" in children)) {
    children = [children];
  }
  let shouldSetComponentName = context.annotateFragments;
  children.forEach((child) => {
    if (!child.node) {
      return;
    }
    const openingElement = child.get("openingElement");
    if (Array.isArray(openingElement)) {
      return;
    }
    if (shouldSetComponentName && openingElement?.node) {
      shouldSetComponentName = false;
      processJSX(context, child, currentComponentName);
    } else {
      processJSX(context, child, "");
    }
  });
  if (isRootElement && context.autoInjectSentryLabel) {
    maybeInjectSentryLabel(context, jsxNode);
  }
}
function applyAttributes(context, openingElement, componentName) {
  const { t, attributeNames, ignoredComponents, fragmentContext, sourceFileName } = context;
  if (!openingElement.node) {
    return;
  }
  if (!openingElement.node.attributes) openingElement.node.attributes = [];
  const elementName = getPathName(t, openingElement);
  for (const [name, value] of componentAnnotation.getComponentAnnotationAttributes({
    attributeNames,
    componentName,
    elementName,
    existingAttributes: getExistingAttributeNames(openingElement),
    ignoredComponents,
    isFragment: isReactFragment(t, openingElement, fragmentContext),
    sourceFileName
  })) {
    openingElement.node.attributes.push(t.jSXAttribute(t.jSXIdentifier(name), t.stringLiteral(value)));
  }
}
function sourceFileNameFromState(state) {
  const name = fullSourceFileNameFromState(state);
  if (!name) {
    return void 0;
  }
  if (name.indexOf("/") !== -1) {
    return name.split("/").pop();
  } else if (name.indexOf("\\") !== -1) {
    return name.split("\\").pop();
  } else {
    return name;
  }
}
function fullSourceFileNameFromState(state) {
  const name = state.file.opts.parserOpts?.sourceFileName;
  if (typeof name === "string") {
    return name;
  }
  return null;
}
function isKnownIncompatiblePluginFromState(state) {
  const fullSourceFileName = fullSourceFileNameFromState(state);
  if (!fullSourceFileName) {
    return false;
  }
  return constants.KNOWN_INCOMPATIBLE_PLUGINS.some((pluginName) => {
    if (fullSourceFileName.includes(`/node_modules/${pluginName}/`) || fullSourceFileName.includes(`\\node_modules\\${pluginName}\\`)) {
      return true;
    }
    return false;
  });
}
function attributeNamesFromState(state) {
  if (state.opts.native) {
    return [componentAnnotation.NATIVE_COMPONENT_NAME, componentAnnotation.NATIVE_ELEMENT_NAME, componentAnnotation.NATIVE_SOURCE_FILE_NAME];
  }
  return [componentAnnotation.WEB_COMPONENT_NAME, componentAnnotation.WEB_ELEMENT_NAME, componentAnnotation.WEB_SOURCE_FILE_NAME];
}
function collectFragmentContext(programPath) {
  const fragmentAliases = /* @__PURE__ */ new Set();
  const reactNamespaceAliases = /* @__PURE__ */ new Set(["React"]);
  programPath.traverse({
    ImportDeclaration(importPath) {
      const source = importPath.node.source.value;
      if (source === "react" || source === "React") {
        importPath.node.specifiers.forEach((spec) => {
          if (spec.type === "ImportSpecifier" && spec.imported.type === "Identifier") {
            if (spec.imported.name === "Fragment") {
              fragmentAliases.add(spec.local.name);
            }
          } else if (spec.type === "ImportDefaultSpecifier" || spec.type === "ImportNamespaceSpecifier") {
            reactNamespaceAliases.add(spec.local.name);
          }
        });
      }
    },
    // Handle simple variable assignments only (avoid complex cases)
    VariableDeclarator(varPath) {
      if (varPath.node.init) {
        const init = varPath.node.init;
        if (varPath.node.id.type === "Identifier") {
          if (init.type === "Identifier" && fragmentAliases.has(init.name)) {
            fragmentAliases.add(varPath.node.id.name);
          }
          if (init.type === "MemberExpression" && init.object.type === "Identifier" && init.property.type === "Identifier" && init.property.name === "Fragment" && reactNamespaceAliases.has(init.object.name)) {
            fragmentAliases.add(varPath.node.id.name);
          }
        }
        if (varPath.node.id.type === "ObjectPattern") {
          if (init.type === "Identifier" && reactNamespaceAliases.has(init.name)) {
            const properties = varPath.node.id.properties;
            for (const prop of properties) {
              if (prop.type === "ObjectProperty" && prop.key?.type === "Identifier" && prop.value?.type === "Identifier" && prop.key.name === "Fragment") {
                fragmentAliases.add(prop.value.name);
              }
            }
          }
        }
      }
    }
  });
  return { fragmentAliases, reactNamespaceAliases };
}
function isReactFragment(t, openingElement, context) {
  if (openingElement.isJSXFragment()) {
    return true;
  }
  const elementName = getPathName(t, openingElement);
  if (elementName === "Fragment" || elementName === "React.Fragment") {
    return true;
  }
  if (context && elementName && context.fragmentAliases.has(elementName)) {
    return true;
  }
  if (openingElement.node && "name" in openingElement.node && openingElement.node.name && typeof openingElement.node.name === "object" && "type" in openingElement.node.name && openingElement.node.name.type === "JSXMemberExpression") {
    const nodeName = openingElement.node.name;
    if (typeof nodeName !== "object" || !nodeName) {
      return false;
    }
    if ("object" in nodeName && "property" in nodeName) {
      const nodeNameObject = nodeName.object;
      const nodeNameProperty = nodeName.property;
      if (typeof nodeNameObject !== "object" || typeof nodeNameProperty !== "object") {
        return false;
      }
      if (!nodeNameObject || !nodeNameProperty) {
        return false;
      }
      const objectName = "name" in nodeNameObject && nodeNameObject.name;
      const propertyName = "name" in nodeNameProperty && nodeNameProperty.name;
      if (objectName === "React" && propertyName === "Fragment") {
        return true;
      }
      if (context) {
        if (context.reactNamespaceAliases.has(objectName) && propertyName === "Fragment") {
          return true;
        }
        if (context.fragmentAliases.has(objectName) && propertyName === "Fragment") {
          return true;
        }
      }
    }
  }
  return false;
}
function getExistingAttributeNames(openingElement) {
  const names = /* @__PURE__ */ new Set();
  openingElement.node.attributes.forEach((node) => {
    if (node.type === "JSXAttribute" && typeof node.name.name === "string") {
      names.add(node.name.name);
    }
  });
  return names;
}
function getPathName(t, path) {
  if (!path.node) return UNKNOWN_ELEMENT_NAME;
  if (!("name" in path.node)) {
    return UNKNOWN_ELEMENT_NAME;
  }
  const name = path.node.name;
  if (typeof name === "string") {
    return name;
  }
  if (t.isIdentifier(name) || t.isJSXIdentifier(name)) {
    return name.name;
  }
  if (t.isJSXNamespacedName(name)) {
    return name.name.name;
  }
  if (t.isJSXMemberExpression(name)) {
    const objectName = getJSXMemberExpressionObjectName(t, name.object);
    const propertyName = name.property.name;
    return `${objectName}.${propertyName}`;
  }
  return UNKNOWN_ELEMENT_NAME;
}
function getJSXMemberExpressionObjectName(t, object) {
  if (t.isJSXIdentifier(object)) {
    return object.name;
  }
  if (t.isJSXMemberExpression(object)) {
    const objectName = getJSXMemberExpressionObjectName(t, object.object);
    return `${objectName}.${object.property.name}`;
  }
  return UNKNOWN_ELEMENT_NAME;
}
function extractStaticTextFromChildren(t, node, textComponentNames, depth, isRoot) {
  if (depth <= 0) {
    return [];
  }
  const texts = [];
  for (const child of node.children) {
    if (t.isJSXText(child)) {
      if (isRoot) {
        const trimmed = child.value.replace(/\s+/g, " ").trim();
        if (trimmed) {
          texts.push(trimmed);
        }
      }
    } else if (t.isJSXElement(child)) {
      const childName = getElementName(t, child.openingElement);
      if (textComponentNames.includes(childName)) {
        const innerTexts = extractTextFromTextComponent(t, child, textComponentNames);
        if (innerTexts === null) {
          return null;
        }
        texts.push(...innerTexts);
      } else {
        const result = extractStaticTextFromChildren(t, child, textComponentNames, depth - 1, false);
        if (result === null) {
          return null;
        }
        texts.push(...result);
      }
    } else if (t.isJSXFragment(child)) {
      const result = extractStaticTextFromChildren(t, child, textComponentNames, depth, isRoot);
      if (result === null) {
        return null;
      }
      texts.push(...result);
    } else if (t.isJSXExpressionContainer(child)) {
      if (!t.isJSXEmptyExpression(child.expression)) {
        return null;
      }
    } else if (t.isJSXSpreadChild(child)) {
      return null;
    }
  }
  return texts;
}
function extractTextFromTextComponent(t, node, textComponentNames) {
  const texts = [];
  for (const child of node.children) {
    if (t.isJSXText(child)) {
      const trimmed = child.value.replace(/\s+/g, " ").trim();
      if (trimmed) {
        texts.push(trimmed);
      }
    } else if (t.isJSXExpressionContainer(child)) {
      if (!t.isJSXEmptyExpression(child.expression)) {
        return null;
      }
    } else if (t.isJSXElement(child)) {
      const childName = getElementName(t, child.openingElement);
      if (textComponentNames.includes(childName)) {
        const innerTexts = extractTextFromTextComponent(t, child, textComponentNames);
        if (innerTexts === null) {
          return null;
        }
        texts.push(...innerTexts);
      } else {
        const innerTexts = extractTextFromTextComponent(t, child, textComponentNames);
        if (innerTexts === null) {
          return null;
        }
      }
    } else if (t.isJSXFragment(child)) {
      const innerTexts = extractTextFromTextComponent(t, child, textComponentNames);
      if (innerTexts === null) {
        return null;
      }
      texts.push(...innerTexts);
    } else if (t.isJSXSpreadChild(child)) {
      return null;
    }
  }
  return texts;
}
function getElementName(t, openingElement) {
  const name = openingElement.name;
  if (t.isJSXIdentifier(name)) {
    return name.name;
  }
  if (t.isJSXMemberExpression(name)) {
    return `${getJSXMemberExpressionObjectName(t, name.object)}.${name.property.name}`;
  }
  return "";
}
function maybeInjectSentryLabel(context, jsxNode) {
  const { t, textComponentNames, ignoredComponents, componentName } = context;
  const node = jsxNode.node;
  let targetElement;
  if (t.isJSXElement(node)) {
    targetElement = node;
  } else if (t.isJSXFragment(node)) {
    const firstChild = node.children.find((c) => t.isJSXElement(c));
    if (!firstChild) {
      return;
    }
    targetElement = firstChild;
  } else {
    return;
  }
  const targetElementName = getElementName(t, targetElement.openingElement);
  if (ignoredComponents.some((ignored) => ignored === componentName || ignored === targetElementName)) {
    return;
  }
  if (targetElement.openingElement.attributes.some(
    (attr) => t.isJSXAttribute(attr) && attr.name.name === SENTRY_LABEL_ATTRIBUTE
  )) {
    return;
  }
  const texts = extractStaticTextFromChildren(t, targetElement, textComponentNames, MAX_TEXT_SEARCH_DEPTH, true);
  if (texts === null) {
    return;
  }
  let label = texts.join(" ").replace(/\s+/g, " ").trim();
  if (!label) {
    return;
  }
  if (label.length > MAX_LABEL_LENGTH) {
    label = `${label.substring(0, MAX_LABEL_LENGTH - 3)}...`;
  }
  targetElement.openingElement.attributes.push(
    t.jSXAttribute(t.jSXIdentifier(SENTRY_LABEL_ATTRIBUTE), t.stringLiteral(label))
  );
}
const UNKNOWN_ELEMENT_NAME = "unknown";

exports.experimentalComponentNameAnnotatePlugin = experimental.experimentalComponentNameAnnotatePlugin;
exports.default = componentNameAnnotatePlugin;
//# sourceMappingURL=index.js.map
