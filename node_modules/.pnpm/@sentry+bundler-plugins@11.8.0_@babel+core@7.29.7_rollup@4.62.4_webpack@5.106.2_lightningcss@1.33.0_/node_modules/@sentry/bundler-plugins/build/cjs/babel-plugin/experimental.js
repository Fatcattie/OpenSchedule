Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const REACT_NATIVE_ELEMENTS = [
  "Image",
  "Text",
  "View",
  "ScrollView",
  "TextInput",
  "TouchableOpacity",
  "TouchableHighlight",
  "TouchableWithoutFeedback",
  "FlatList",
  "SectionList",
  "ActivityIndicator",
  "Button",
  "Switch",
  "Modal",
  "SafeAreaView",
  "StatusBar",
  "KeyboardAvoidingView",
  "RefreshControl",
  "Picker",
  "Slider"
];
function experimentalComponentNameAnnotatePlugin({ types: t }) {
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
        const context = createJSXProcessingContext(state, t, path.node.id.name);
        functionBodyPushAttributes(context, path);
      },
      ArrowFunctionExpression(path, state) {
        const parent = path.parent;
        if (!parent || !("id" in parent) || !parent.id || !("name" in parent.id) || !parent.id.name) {
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
        if (!render?.traverse) {
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
function isHtmlElement(elementName) {
  if (elementName === UNKNOWN_ELEMENT_NAME) {
    return false;
  }
  if (elementName.length > 0 && elementName.charAt(0) === elementName.charAt(0).toLowerCase()) {
    return true;
  }
  if (REACT_NATIVE_ELEMENTS.includes(elementName)) {
    return true;
  }
  return false;
}
function createJSXProcessingContext(state, t, componentName) {
  return {
    t,
    componentName,
    attributeName: attributeNamesFromState(state),
    ignoredComponents: state.opts.ignoredComponents ?? [],
    fragmentContext: state.sentryFragmentContext
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
function processJSX(context, jsxNode) {
  if (!jsxNode) {
    return;
  }
  const paths = jsxNode.get("openingElement");
  const openingElements = Array.isArray(paths) ? paths : [paths];
  const hasInjectedAttributes = openingElements.reduce(
    (prev, openingElement) => prev || applyAttributes(context, openingElement, context.componentName),
    false
  );
  if (hasInjectedAttributes) {
    return;
  }
  let children = jsxNode.get("children");
  if (children && !("length" in children)) {
    children = [children];
  }
  children.forEach((child) => {
    if (!child.node) {
      return;
    }
    const openingElement = child.get("openingElement");
    if (Array.isArray(openingElement)) {
      return;
    }
    processJSX(context, child);
  });
}
function applyAttributes(context, openingElement, componentName) {
  const { t, attributeName: componentAttributeName, ignoredComponents, fragmentContext } = context;
  if (!openingElement.node) {
    return false;
  }
  const isFragment = isReactFragment(t, openingElement, fragmentContext);
  if (isFragment) {
    return false;
  }
  if (!openingElement.node.attributes) {
    openingElement.node.attributes = [];
  }
  const elementName = getPathName(t, openingElement);
  if (!isHtmlElement(elementName)) {
    return false;
  }
  const isAnIgnoredComponent = ignoredComponents.some(
    (ignoredComponent) => ignoredComponent === componentName || ignoredComponent === elementName
  );
  if (!isAnIgnoredComponent && !hasAttributeWithName(openingElement, componentAttributeName)) {
    if (componentAttributeName) {
      openingElement.node.attributes.push(
        t.jSXAttribute(t.jSXIdentifier(componentAttributeName), t.stringLiteral(componentName))
      );
    }
  }
  return true;
}
function attributeNamesFromState(state) {
  if (state.opts.native) {
    return "dataSentryComponent";
  }
  return "data-sentry-component";
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
function hasAttributeWithName(openingElement, name) {
  if (!name) {
    return false;
  }
  return openingElement.node.attributes.some((node) => {
    if (node.type === "JSXAttribute") {
      return node.name.name === name;
    }
    return false;
  });
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
const UNKNOWN_ELEMENT_NAME = "unknown";

exports.experimentalComponentNameAnnotatePlugin = experimentalComponentNameAnnotatePlugin;
//# sourceMappingURL=experimental.js.map
